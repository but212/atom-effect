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

import { type EffectObject, isAtom } from '@but212/atom-effect';
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
import {
  createContextProxy,
  disposeProviders,
  getInternalState,
  getOrCreateSheet,
  nodeStateMap,
  setProvider,
} from './engine';
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
 * @param element The host element (usually `this` in a Custom Element).
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
  let isTearingDown = false;

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
        const shadowRoot = resolveShadowRoot(element, state.root);
        const { atom, listener } = SetupFeatures.slots(shadowRoot);
        state.slotsAtom = atom;
        if (shadowRoot) {
          state.isSlotListenerAttached = true;
          state.effects.push({
            dispose: () => shadowRoot.removeEventListener('slotchange', listener),
          });
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
      const scopedContext = context ?? state.root ?? element;
      if (typeof selector !== 'string') return $(selector);
      return scopedContext instanceof DocumentFragment
        ? $(scopedContext.querySelectorAll(selector))
        : $(selector, scopedContext as Element);
    }) as JQueryScopedSelector,

    provideAtom: (key: string | symbol, value: unknown) => provideAtom(element, key, value),
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

      const componentConstructor = element.constructor as typeof HTMLElement & AtomComponentStatic;
      const baseConfiguration = options instanceof Node ? { shadowRoot: options } : (options ?? {});

      const config = {
        shadowRoot: baseConfiguration.shadowRoot,
        styles: baseConfiguration.styles ?? componentConstructor.aejStyles,
        bind: baseConfiguration.bind ?? componentConstructor.aejBind,
        aria: baseConfiguration.aria ?? componentConstructor.aejAria,
        parts: baseConfiguration.parts ?? componentConstructor.aejParts,
        dispatch: baseConfiguration.dispatch ?? componentConstructor.aejDispatch,
        val:
          baseConfiguration.val ??
          baseConfiguration.value ??
          componentConstructor.aejVal ??
          componentConstructor.aejValue,
        validation: baseConfiguration.validation ?? componentConstructor.aejValidation,
      };

      const root = config.shadowRoot ?? element.shadowRoot ?? null;
      const shadowRoot = root instanceof ShadowRoot ? root : null;

      if (shadowRoot) {
        registry.markHost(element);
        registry.registerShadow(element, shadowRoot);
      }

      const rootNode = (root ?? element) as (Element | ShadowRoot) & {
        [CLEANUP_MARKER]?: boolean;
      };
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
        const { atom, listener } = SetupFeatures.slots(shadowRoot);
        state.slotsAtom = atom;
        if (shadowRoot) {
          state.isSlotListenerAttached = true;
          state.effects.push({
            dispose: () => shadowRoot.removeEventListener('slotchange', listener),
          });
        }
      } else if (shadowRoot && !state.isSlotListenerAttached) {
        const listener = (event: Event) => {
          const target = event.target as HTMLSlotElement;
          const slotsAtom = state.slotsAtom;
          if (slotsAtom) {
            slotsAtom.value = {
              ...slotsAtom.peek(),
              [target.name || '']: target.assignedNodes(),
            };
          }
        };
        shadowRoot.addEventListener('slotchange', listener);
        state.effects.push({
          dispose: () => shadowRoot.removeEventListener('slotchange', listener),
        });
        state.isSlotListenerAttached = true;

        const next: Record<string, Node[]> = {};
        for (const slotElement of shadowRoot.querySelectorAll('slot')) {
          next[slotElement.name || ''] = slotElement.assignedNodes();
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

      if (internals && (config.val !== undefined || config.validation !== undefined)) {
        SetupFeatures.form(element, internals, config.val, config.validation, state.effects);
      }

      state.isInitialized = true;
      registry.setTeardown(element, () => controller.teardown());
    },

    /**
     * Logic: Deterministic Teardown
     * Releases all reactive resources, providers, and observers
     * associated with this component instance.
     */
    teardown() {
      if (isTearingDown) return;
      isTearingDown = true;
      try {
        const componentState = nodeStateMap.get(element);
        if (componentState) {
          disposeProviders(element);
          componentState.injects?.clear();
        }

        state.dispose();
        registry.cleanupTree(element);
      } finally {
        isTearingDown = false;
      }
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
 * @param element The host element or collection acting as provider.
 * @param key Unique identifier for the context.
 * @param value The reactive atom or static value to share.
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
  value: unknown
): void {
  const targets =
    element instanceof HTMLElement
      ? [element]
      : typeof element === 'string'
        ? Array.from(document.querySelectorAll<HTMLElement>(element))
        : ((element as JQuery).toArray() as HTMLElement[]);

  for (const element of targets) {
    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    let providerEffect: EffectObject | undefined;

    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (newValue: unknown) =>
        element.style.setProperty(varName, String(newValue ?? ''));
      if (isAtom(value)) {
        providerEffect = $.effect(() => {
          sync(value.value);
          return undefined;
        });
      } else sync(value);
    }

    setProvider(element, key, value, providerEffect);
    if (providerEffect) registry.trackEffect(element, providerEffect);
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
 * @param element The element requesting the context.
 * @param key The unique identifier of the context to locate.
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
  const targetElement =
    element instanceof HTMLElement
      ? element
      : typeof element === 'string'
        ? document.querySelector<HTMLElement>(element)
        : ((element as JQuery)[0] as HTMLElement);

  if (!targetElement) return null;

  if (debug.enabled && typeof customElements !== 'undefined') {
    const tagName = targetElement.tagName.toLowerCase();
    if (tagName.includes('-') && !customElements.get(tagName)) {
      debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
    }
  }

  const state = getInternalState(targetElement);
  if (!state.injects) state.injects = new Map();
  let existing = state.injects.get(key);
  if (!existing) {
    existing = createContextProxy<T>(targetElement, key) as WritableAtom<unknown>;
    state.injects.set(key, existing);
  }
  return existing as WritableAtom<T | null>;
}

// Attach to jQuery namespace
$.extend({ provideAtom, injectAtom, useAtomComponent });
