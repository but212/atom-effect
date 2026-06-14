/**
 * @module AEJWebComponent
 *
 * Responsibility:
 * Orchestrates reactive Web Component features, including custom element
 * controllers, dependency injection (provide/inject), and Shadow DOM
 * synchronization.
 *
 * Design Intent:
 * Bridges the gap between JQuery-style imperative DOM manipulation and
 * modern reactive Custom Elements. It enables state-driven component
 * development with automatic lifecycle management.
 */

import { isAtom } from '@but212/atom-effect';
import $ from 'jquery';
import { SYSTEM_COMPONENT } from '@/constants';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import { CLEANUP_MARKER } from '@/core/symbols';
import type {
  AtomComponentController,
  AtomComponentStatic,
  JQueryScopedSelector,
  WritableAtom,
} from '@/types';
import { debug } from '@/utils/debug';
import { createContextProxy, getInternalState, getOrCreateSheet, nodeStateMap } from './engine';
import { SetupFeatures } from './setup';
import { ComponentState } from './state';
import { resolveShadowRoot } from './utils';

const supportsConstructableStylesheets =
  typeof window !== 'undefined' &&
  'adoptedStyleSheets' in Document.prototype &&
  'replaceSync' in CSSStyleSheet.prototype;

const supportsInternals =
  typeof window !== 'undefined' && 'attachInternals' in HTMLElement.prototype;

/**
 * Logic: Component Lifecycle Controller
 * Orchestrates reactive features for a specific DOM element, managing
 * bindings, styles, and resource cleanup.
 *
 * When to use:
 * - Recommended for integrating reactive state into standard Custom Elements.
 * - Suitable for mapping attributes and slots to reactive atoms.
 * - When you need automatic cleanup of effects when an element is removed.
 *
 * @param element - The host element (usually `this` in a Custom Element).
 * @returns A controller for managing the component's reactive lifecycle.
 *
 * @example
 * ```typescript
 * class MyToggle extends HTMLElement {
 *   private aej = $.useAtomComponent(this);
 *   private active = $.atom(false);
 *
 *   connectedCallback() {
 *     this.aej.setup({
 *       bind: { label: $.computed(() => this.active.value ? 'ON' : 'OFF') },
 *       dispatch: { toggle: this.active }
 *     });
 *   }
 * }
 * ```
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  // Security: Guard against use on unregistered elements to prevent silent initialization failures.
  if (debug.enabled && typeof customElements !== 'undefined') {
    const tagName = element.tagName.toLowerCase();
    if (tagName.includes('-') && !customElements.get(tagName)) {
      debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
    }
  }

  const internal = getInternalState(element);
  if (internal.controller) return internal.controller;

  let internals: ElementInternals | undefined;
  if (supportsInternals) {
    try {
      internals = element.attachInternals();
    } catch {
      /* ignored */
    }
  }

  const state = new ComponentState(element);

  const controller: AtomComponentController = {
    host: element,
    get root() {
      return state.root;
    },
    get internals() {
      return internals;
    },

    /**
     * Logic: Lazy Attribute Mapping
     * Returns a reactive lens for a DOM attribute. Updates when the
     * attribute changes via MutationObserver.
     */
    get attrs() {
      if (!state.attributeAtom) {
        const { atom, observer } = SetupFeatures.attributes(element);
        state.attributeAtom = atom;
        state.effects.push({ dispose: () => observer.disconnect() });
      }
      return (name: string) => {
        let lens = state.attributeLenses.get(name);
        if (!lens) {
          const attrAtom = state.attributeAtom;
          if (attrAtom) {
            const nextLens = $.atomLens(attrAtom, name);
            state.attributeLenses.set(name, nextLens);
            lens = nextLens;
          }
        }
        return lens;
      };
    },

    /**
     * Logic: Lazy Slot Mapping
     * Returns a reactive lens for named slots. Automatically tracks
     * `assignedNodes` changes in Shadow DOM.
     */
    get slots() {
      if (!state.slotsAtom) {
        const sr = resolveShadowRoot(element, state.root);
        const { atom, listener } = SetupFeatures.slots(sr);
        state.slotsAtom = atom;
        if (sr) {
          state.slotListenerAttached = true;
          state.effects.push({ dispose: () => sr.removeEventListener('slotchange', listener) });
        }
      }
      return (name: string) => {
        const key = name === 'default' ? '' : name;
        let lens = state.slotLenses.get(key);
        if (!lens) {
          lens = $.computed(() => state.slotsAtom?.value?.[key] ?? []) as WritableAtom<Node[]>;
          state.slotLenses.set(key, lens);
        }
        return lens;
      };
    },

    $: ((selector, context) => {
      const ctx = context ?? state.root ?? element;
      if (typeof selector !== 'string') return $(selector);
      return ctx instanceof DocumentFragment
        ? $(ctx.querySelectorAll(selector))
        : $(selector, ctx as Element);
    }) as JQueryScopedSelector,

    provideAtom: (key: string | symbol, val: unknown) => provideAtom(element, key, val),
    injectAtom: <T = unknown>(key: string | symbol) => injectAtom<T>(element, key),

    /**
     * Logic: Atomic Setup
     * Bootstraps component features (bindings, styles, etc.).
     * This is idempotent; calling it twice with the same root does nothing.
     */
    setup(options: Parameters<AtomComponentController['setup']>[0]) {
      if (state.isInitialized) {
        const incoming = options instanceof Node ? options : options?.shadowRoot;
        if (incoming && incoming !== state.root)
          throw new Error('Call teardown() first to change the root.');
        return;
      }

      const ctor = element.constructor as typeof HTMLElement & AtomComponentStatic;
      const baseConfig = options instanceof Node ? { shadowRoot: options } : (options ?? {});

      const config = {
        shadowRoot: baseConfig.shadowRoot,
        styles: baseConfig.styles ?? ctor.aejStyles,
        bind: baseConfig.bind ?? ctor.aejBind,
        aria: baseConfig.aria ?? ctor.aejAria,
        parts: baseConfig.parts ?? ctor.aejParts,
        dispatch: baseConfig.dispatch ?? ctor.aejDispatch,
        value: baseConfig.value ?? ctor.aejValue,
        validation: baseConfig.validation ?? ctor.aejValidation,
      };

      const root = config.shadowRoot ?? element.shadowRoot ?? null;
      const sr = root instanceof ShadowRoot ? root : null;

      if (sr) {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      }

      const rootNode = (root ?? element) as (Element | ShadowRoot) & { [CLEANUP_MARKER]?: boolean };
      state.root = rootNode;

      if (!rootNode[CLEANUP_MARKER]) {
        enableAutoCleanup(rootNode);
        rootNode[CLEANUP_MARKER] = true;
        state.effects.push({
          dispose: () => {
            disableAutoCleanupFor(rootNode);
            rootNode[CLEANUP_MARKER] = false;
          },
        });
      }

      if (!state.slotsAtom) {
        const { atom, listener } = SetupFeatures.slots(sr);
        state.slotsAtom = atom;
        if (sr) {
          state.slotListenerAttached = true;
          state.effects.push({ dispose: () => sr.removeEventListener('slotchange', listener) });
        }
      } else if (sr && !state.slotListenerAttached) {
        const listener = (e: Event) => {
          const target = e.target as HTMLSlotElement;
          const slotsAtom = state.slotsAtom;
          if (slotsAtom) {
            slotsAtom.value = {
              ...slotsAtom.peek(),
              [target.name || '']: target.assignedNodes(),
            };
          }
        };
        sr.addEventListener('slotchange', listener);
        state.effects.push({ dispose: () => sr.removeEventListener('slotchange', listener) });
        state.slotListenerAttached = true;

        const next: Record<string, Node[]> = {};
        for (const s of sr.querySelectorAll('slot')) {
          next[s.name || ''] = s.assignedNodes();
        }
        state.slotsAtom.value = next;
      }

      if (config.dispatch) SetupFeatures.dispatch(element, config.dispatch, state.effects);
      if (config.bind) SetupFeatures.hydrate(rootNode as Element, config.bind, state.effects);

      if (
        config.styles &&
        supportsConstructableStylesheets &&
        (rootNode instanceof ShadowRoot || rootNode instanceof Document)
      ) {
        const sheets = config.styles.map(getOrCreateSheet);
        SetupFeatures.styles(rootNode, sheets);
        state.effects.push({
          dispose: () => {
            rootNode.adoptedStyleSheets = rootNode.adoptedStyleSheets.filter(
              (s) => !sheets.includes(s)
            );
          },
        });
      }

      if (config.aria && internals) SetupFeatures.aria(internals, config.aria, state.effects);
      if (config.parts) SetupFeatures.parts(rootNode as Element, config.parts, state.effects);

      if (internals && (config.value !== undefined || config.validation !== undefined)) {
        SetupFeatures.form(element, internals, config.value, config.validation, state.effects);
      }

      state.isInitialized = true;
    },

    /**
     * Logic: Deterministic Teardown
     * Releases all reactive resources, providers, and observers
     * associated with this component instance.
     */
    teardown() {
      const s = nodeStateMap.get(element);
      if (s) {
        s.providers?.clear();

        if (s.providerEffects) {
          for (const e of s.providerEffects.values()) {
            e.dispose();
          }
        }
        s.providerEffects?.clear();
        s.injects?.clear();
      }

      state.dispose();
      registry.cleanupTree(element);
    },
  } as AtomComponentController;

  registry.setTeardown(element, () => controller.teardown());
  internal.controller = controller;
  return controller;
}

/**
 * Logic: Dependency Provider
 * Registers a value or atom to be provided to all descendant elements.
 *
 * Logic: CSS Variable Synchronization
 * Automatically synchronizes the provided value to a CSS variable
 * `--aej-[key]` on the host element for state-driven styling.
 *
 * When to use:
 * - When you need to share state (like themes or user sessions) across a deep DOM tree.
 * - When you want to control CSS properties reactively via atoms.
 *
 * @param element - The host element or collection acting as provider.
 * @param key - Unique identifier for the context.
 * @param val - The reactive atom or static value to share.
 *
 * @example
 * ```typescript
 * const theme = $.atom('dark');
 * $.provideAtom('#app', 'theme', theme);
 *
 * // In CSS:
 * // .child { color: var(--aej-theme); }
 * ```
 */
export function provideAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol,
  val: unknown
): void {
  const targets =
    element instanceof HTMLElement
      ? [element]
      : typeof element === 'string'
        ? Array.from(document.querySelectorAll<HTMLElement>(element))
        : ((element as JQuery).toArray() as HTMLElement[]);

  for (const el of targets) {
    const state = getInternalState(el);
    if (!state.providers) {
      state.providers = new Map();
    }
    state.providers.set(key, val);

    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (v: unknown) => el.style.setProperty(varName, String(v ?? ''));
      if (isAtom(val)) {
        if (!state.providerEffects) state.providerEffects = new Map();
        state.providerEffects.get(key)?.dispose();
        state.providerEffects.set(
          key,
          $.effect(() => {
            sync(val.value);
            return undefined;
          })
        );
      } else sync(val);
    }
  }
}

/**
 * Logic: Dependency Injection
 * Injects a provided value or atom from an ancestor.
 *
 * Logic: Late-Bound Proxy
 * Returns a reactive proxy atom that automatically re-locates providers
 * if the element is moved within the DOM hierarchy.
 *
 * When to use:
 * - To consume state provided by a `provideAtom` ancestor.
 * - When components might be moved (drag-and-drop) and need to stay synced with their new context.
 *
 * @param element - The element requesting the context.
 * @param key - The unique identifier of the context to locate.
 * @returns A reactive proxy atom representing the injected context.
 *
 * @example
 * ```typescript
 * class MyChild extends HTMLElement {
 *   connectedCallback() {
 *     const theme = $.injectAtom(this, 'theme');
 *     $.effect(() => {
 *       this.style.color = theme.value === 'dark' ? 'white' : 'black';
 *     });
 *   }
 * }
 * ```
 */
export function injectAtom<T = unknown>(
  element: HTMLElement | JQuery | string,
  key: string | symbol
): WritableAtom<T | null> | null {
  const target =
    element instanceof HTMLElement
      ? element
      : typeof element === 'string'
        ? document.querySelector<HTMLElement>(element)
        : ((element as JQuery)[0] as HTMLElement);

  if (!target) return null;

  if (debug.enabled && typeof customElements !== 'undefined') {
    const tagName = target.tagName.toLowerCase();
    if (tagName.includes('-') && !customElements.get(tagName)) {
      debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
    }
  }

  const state = getInternalState(target);
  if (!state.injects) state.injects = new Map();
  let existing = state.injects.get(key);
  if (!existing) {
    existing = createContextProxy<T>(target, key) as WritableAtom<unknown>;
    state.injects.set(key, existing);
  }
  return existing as WritableAtom<T | null>;
}

// Attach to jQuery namespace
$.extend({ provideAtom, injectAtom, useAtomComponent });
