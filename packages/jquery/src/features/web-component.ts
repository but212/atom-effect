import { BRAND, BrandFlags, isAtom, isWritable } from '@but212/atom-effect';
import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type { AtomComponentController, EffectObject, WritableAtom } from '@/types';

// ─── Constants & Types ───────────────────────────────────────────────────────

const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');
const CONTEXT_REQUEST = 'aej:context-request';

/** @internal */
interface ContextRequestDetail {
  key: string | symbol;
  callback: (atom: unknown) => void;
}

/**
 * Data-Centric Node State.
 *
 * Reason: Consolidating all metadata (providers, effects, injects) into a single
 * structure per Node reduces lookup overhead from O(N) WeakMap lookups to O(1)
 * object property access after the initial fetch.
 *
 * @internal
 */
interface NodeInternalState {
  providers?: Map<string | symbol, unknown>;
  providerEffects?: Map<string | symbol, EffectObject>;
  injects?: Map<string | symbol, WritableAtom<unknown>>;
  controller?: AtomComponentController;
}

// ─── Internal State (The Single Source of Truth) ────────────────────────────

const nodeStateMap = new WeakMap<Node, NodeInternalState>();

/**
 * Helper to get or create internal state for a node.
 * Constraint: Must be accessed via this helper to ensure lazy initialization.
 */
function getInternalState(node: Node): NodeInternalState {
  let state = nodeStateMap.get(node);
  if (!state) {
    state = {};
    nodeStateMap.set(node, state);
  }
  return state;
}

// ─── Context Engine (Move Detection & Discovery) ───────────────────────────

/**
 * Manages global hierarchy versioning and DOM move detection.
 * Logic: Bumping the version triggers re-discovery in all reactive proxies.
 */
const ContextEngine = {
  version: $.atom(0),
  isBumpPending: false,

  bump() {
    this.version.value++;
  },

  /**
   * Dispatches a bubbling event to find the nearest provider for a key.
   *
   * Logic: Event bubbling is the simplest way to traverse the DOM tree
   * while respecting Shadow DOM boundaries (via composed: true).
   */
  discover(target: HTMLElement, key: string | symbol): unknown {
    let found: unknown = null;
    const event = new CustomEvent<ContextRequestDetail>(CONTEXT_REQUEST, {
      detail: {
        key,
        callback: (atom) => {
          found = atom;
        },
      },
      bubbles: true,
      composed: true,
    });
    target.dispatchEvent(event);
    return found;
  },
};

// Optimization: Use a single global MutationObserver for all AEJ components.
// Logic: We throttle version bumps to the next microtask to avoid "double-reactive" updates.
if (typeof document !== 'undefined') {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
      if (ContextEngine.isBumpPending) return;
      ContextEngine.isBumpPending = true;
      queueMicrotask(() => {
        ContextEngine.bump();
        ContextEngine.isBumpPending = false;
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// ─── Context Proxy Factory ──────────────────────────────────────────────────

/**
 * Creates a reactive proxy that resolves to a provided atom in the DOM hierarchy.
 *
 * Logic:
 * This proxy implements a "Hybrid Discovery" model:
 * 1. Reactive: Subscribes to ContextEngine.version to detect DOM moves.
 * 2. Synchronous: Performs immediate discovery on .value access to ensure
 *    correctness even outside reactive contexts (e.g. initial setup or tests).
 */
function createContextProxy<T>(target: HTMLElement, key: string | symbol): WritableAtom<T> {
  let _currentProvider: WritableAtom<T> | null = null;
  let _shared: WritableAtom<T> | null = null;

  const getLatestProvider = () => ContextEngine.discover(target, key) as WritableAtom<T>;

  const proxyAtom: WritableAtom<T> = {
    get value() {
      // Logic: Establish dependency on hierarchy version so we re-run when moved.
      ContextEngine.version.value;
      _currentProvider = getLatestProvider();
      return (isAtom(_currentProvider) ? _currentProvider.value : _currentProvider) as T;
    },
    set value(v: T) {
      _currentProvider = getLatestProvider();
      if (isWritable(_currentProvider)) _currentProvider.value = v;
    },
    peek() {
      _currentProvider = getLatestProvider();
      return (isAtom(_currentProvider) ? _currentProvider.peek() : _currentProvider) as T;
    },
    subscribe: (fn) => {
      // Optimization: Only create a long-lived computed if there are manual subscribers.
      if (!_shared) _shared = $.computed(() => proxyAtom.value);
      return _shared.subscribe(fn);
    },
    subscriberCount: () => _shared?.subscriberCount() ?? 0,
    dispose: () => {
      _shared?.dispose();
      _shared = null;
      _currentProvider = null;
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T>;

  return proxyAtom;
}

// ─── Controller Implementation ───────────────────────────────────────────────

/**
 * Composition-based controller for AEJ-powered Web Components.
 *
 * When to use:
 * - When building Custom Elements that need reactive state and scoped jQuery selection.
 * - To manage complex component lifecycles with automatic resource cleanup.
 *
 * @param element - The host Custom Element instance.
 * @returns A controller for managing reactivity, attributes, and shadow root.
 *
 * @example
 * class MyComponent extends HTMLElement {
 *   private aej = $.useAtomComponent(this);
 *
 *   connectedCallback() {
 *     this.aej.setup();
 *     this.aej.$('.btn').on('click', () => console.log('Clicked!'));
 *   }
 *
 *   disconnectedCallback() {
 *     this.aej.teardown();
 *   }
 * }
 * customElements.define('my-component', MyComponent);
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  const state = getInternalState(element);
  if (state.controller) return state.controller;

  const reactive = {
    root: null as (Node & { [CLEANUP_MARKER]?: boolean }) | null,
    isInitialized: false,
    attributeAtoms: new Map<string, WritableAtom<string | null>>(),
    attributeObserver: null as MutationObserver | null,
    attrsProxy: null as Record<string, WritableAtom<string | null>> | null,
  };

  const controller: AtomComponentController = {
    host: element,

    get root() {
      return reactive.root;
    },

    get attrs() {
      if (!reactive.attrsProxy) {
        reactive.attrsProxy = new Proxy({} as Record<string, WritableAtom<string | null>>, {
          get(_, prop: string) {
            let atom = reactive.attributeAtoms.get(prop);
            if (!atom) {
              atom = $.atom(element.getAttribute(prop));
              reactive.attributeAtoms.set(prop, atom);

              if (!reactive.attributeObserver) {
                const observed =
                  (
                    element.constructor as typeof HTMLElement & {
                      observedAttributes?: string[];
                    }
                  ).observedAttributes || [];
                reactive.attributeObserver = new MutationObserver(() => {
                  reactive.attributeAtoms.forEach((a, k) => {
                    a.value = element.getAttribute(k);
                  });
                });
                const options: MutationObserverInit = { attributes: true };
                if (observed.length > 0) {
                  options.attributeFilter = observed;
                }
                reactive.attributeObserver.observe(element, options);
              }
            }
            return atom;
          },
        });
      }
      return reactive.attrsProxy as Record<string, WritableAtom<string | null>>;
    },

    $: (selector, context) => {
      const ctx = context || reactive.root || element;
      if (typeof selector !== 'string') return $(selector) as JQuery;

      return ctx instanceof DocumentFragment
        ? ($(Array.from(ctx.querySelectorAll<HTMLElement>(selector))) as JQuery)
        : ($(selector, ctx) as JQuery);
    },

    provideAtom: (key, val) => provideAtom(element, key, val),
    injectAtom: (key) => injectAtom(element, key),

    setup(shadowRoot?: ShadowRoot) {
      if (reactive.isInitialized) {
        if (shadowRoot && shadowRoot !== reactive.root) {
          throw new Error('Call teardown() first.');
        }
        return;
      }

      const sr = shadowRoot || element.shadowRoot;
      if (sr) {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      }

      reactive.root = (sr ?? element) as Node & { [CLEANUP_MARKER]?: boolean };
      if (!reactive.root![CLEANUP_MARKER]) {
        enableAutoCleanup(reactive.root as Element);
        reactive.root![CLEANUP_MARKER] = true;
      }

      reactive.isInitialized = true;
    },

    teardown() {
      const s = getInternalState(element);
      s.providers?.clear();
      s.providerEffects?.forEach((e) => e.dispose());
      s.providerEffects?.clear();
      s.injects?.clear();

      // Logic: Notify descendants that providers on this node are gone.
      ContextEngine.bump();

      if (!reactive.isInitialized) return;

      reactive.isInitialized = false;
      reactive.attributeObserver?.disconnect();
      reactive.attributeObserver = null;

      try {
        if (reactive.root?.[CLEANUP_MARKER]) {
          disableAutoCleanupFor(reactive.root);
          reactive.root[CLEANUP_MARKER] = false;
        }
      } finally {
        reactive.root = null;
        registry.deferCleanup(element);
      }
    },
  };

  state.controller = controller;
  return controller;
}

// ─── Public API (Context Management) ──────────────────────────────────────────
/**
 * Registers an element as a provider for a reactive context value.
 *
 * When to use:
 * - When you need to share state (atoms) with deep descendant elements without prop drilling.
 * - To establish theme or configuration contexts at specific DOM roots.
 *
 * Logic:
 * - Provided values are automatically exposed as CSS variables (`--aej-[key]`).
 * - If the value is an Atom, the CSS variable stays reactively in sync.
 *
 * @param element - The host element, selector, or JQuery collection.
 * @param key - Unique identifier for the context (string or symbol).
 * @param val - The value or Atom to be shared.
 *
 * @example
 * const theme = $.atom('dark');
 * $.provideAtom('#app-root', 'theme', theme);
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

      // Logic: Setup a listener for the bubbling context-request event.
      el.addEventListener(CONTEXT_REQUEST, (e: Event) => {
        const { key: reqKey, callback } = (e as CustomEvent<ContextRequestDetail>).detail;
        if (state.providers?.has(reqKey)) {
          e.stopPropagation();
          callback(state.providers.get(reqKey));
        }
      });
    }

    state.providers.set(key, val);

    // CSS Bridge logic: Sync atom value to CSS variable --aej-[key]
    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (v: unknown) => el.style.setProperty(varName, v == null ? '' : String(v));

      if (isAtom(val)) {
        if (!state.providerEffects) state.providerEffects = new Map();
        state.providerEffects.get(key)?.dispose();

        const effect = $.effect(() => {
          sync(val.value);
          return undefined;
        });
        state.providerEffects.set(key, effect);
      } else {
        sync(val);
      }
    }
  }
  ContextEngine.bump();
}
/**
 * Injects a reactive context provided by an ancestor element.
 *
 * When to use:
 * - To consume state from an ancestor without direct coupling.
 * - To create "Context-Aware" components that adapt to their position in the DOM.
 *
 * Logic:
 * - Returns a reactive proxy that automatically re-discovers providers if moved in the DOM.
 * - Implements "Hybrid Discovery" (Reactive + Synchronous resolution).
 *
 * @param element - The element or selector requesting the context.
 * @param key - The unique identifier of the context to find.
 * @returns A WritableAtom proxy tracking the nearest provider, or null if target not found.
 *
 * @example
 * const theme = $.injectAtom('#child', 'theme');
 * $.effect(() => {
 *   console.log('Active theme:', theme?.value);
 *   return undefined;
 * });
 */

export function injectAtom<T = unknown>(
  element: HTMLElement | JQuery | string,
  key: string | symbol
): WritableAtom<T> | null {
  const target =
    element instanceof HTMLElement
      ? element
      : typeof element === 'string'
        ? document.querySelector<HTMLElement>(element)
        : ((element as JQuery)[0] as HTMLElement);
  if (!target) return null;

  const state = getInternalState(target);
  if (!state.injects) state.injects = new Map();
  let existing = state.injects.get(key);
  if (!existing) {
    existing = createContextProxy<T>(target, key);
    state.injects.set(key, existing);
  }
  return existing as WritableAtom<T>;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
