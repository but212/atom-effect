import { BRAND, BrandFlags, isAtom, isWritable } from '@but212/atom-effect';
import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type { AtomComponentController, EffectObject, WritableAtom } from '@/types';

// ─── Constants & Types ───────────────────────────────────────────────────────

/** Internal symbol used to track if an element has an active MutationObserver. @internal */
const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');

/** Internal event name used for dependency injection discovery. @internal */
const CONTEXT_REQUEST = 'aej:context-request';

/** Detailed payload for context discovery events. @internal */
interface ContextRequestDetail {
  key: string | symbol;
  callback: (atom: unknown) => void;
}

/**
 * Consolidated metadata for DOM nodes participating in the AEJ ecosystem.
 *
 * Reason: Consolidation
 * Aggregating providers, effects, and injections into a single structure
 * per node reduces WeakMap lookup overhead from O(N) to O(1) after the
 * initial state acquisition.
 *
 * @internal
 */
interface NodeInternalState {
  providers?: Map<string | symbol, unknown>;
  providerEffects?: Map<string | symbol, EffectObject>;
  injects?: Map<string | symbol, WritableAtom<unknown>>;
  controller?: AtomComponentController;
}

// ─── Internal State ─────────────────────────────────────────────────────────

/** Global storage for element-specific reactive metadata. */
const nodeStateMap = new WeakMap<Node, NodeInternalState>();

/**
 * Retrieves or initializes the internal metadata state for a node.
 *
 * Constraint: This helper must be used for all state access to ensure
 * lazy initialization and consistent reference tracking.
 *
 * @internal
 */
function getInternalState(node: Node): NodeInternalState {
  let state = nodeStateMap.get(node);
  if (!state) {
    state = {};
    nodeStateMap.set(node, state);
  }
  return state;
}

// ─── Context Engine ─────────────────────────────────────────────────────────

/**
 * Orchestrates global hierarchy versioning and DOM move detection.
 *
 * Logic: Versioning
 * Bumping the global version atom triggers re-discovery in all reactive context
 * proxies, ensuring that moved elements correctly resolve their new nearest providers.
 *
 * @internal
 */
const ContextEngine = {
  version: $.atom(0),
  isBumpPending: false,

  bump() {
    this.version.value++;
  },

  /**
   * Dispatches a bubbling event to locate the nearest ancestor provider for a key.
   *
   * Logic: Discovery Mechanism
   * Event bubbling is used for tree traversal as it natively respects
   * Shadow DOM boundaries when configured with `composed: true`.
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

/**
 * Optimization: Global Observation
 * A single global MutationObserver monitors the entire document for
 * structure changes. Throttling version bumps to the next microtask
 * prevents redundant reactive updates during batch DOM operations.
 */
if (typeof document !== 'undefined') {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
      if (ContextEngine.isBumpPending) {
        return;
      }
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
 * Creates a reactive proxy atom that resolves to a provided value in the DOM hierarchy.
 *
 * Logic: Hybrid Discovery
 * This proxy implements a dual-mode resolution model:
 * 1. Reactive: Subscribes to `ContextEngine.version` to detect DOM moves
 *    and trigger re-evaluation.
 * 2. Synchronous: Performs immediate discovery on property access to
 *    ensure accuracy even outside reactive execution contexts.
 *
 * @internal
 */
function createContextProxy<T>(target: HTMLElement, key: string | symbol): WritableAtom<T> {
  let _currentProvider: WritableAtom<T> | null = null;
  let _shared: WritableAtom<T> | null = null;

  const getLatestProvider = () => ContextEngine.discover(target, key) as WritableAtom<T>;

  const proxyAtom: WritableAtom<T> = {
    get value() {
      // Logic: Establish a dependency on the hierarchy version to re-run when moved.
      ContextEngine.version.value;
      _currentProvider = getLatestProvider();
      return (isAtom(_currentProvider) ? _currentProvider.value : _currentProvider) as T;
    },
    set value(v: T) {
      _currentProvider = getLatestProvider();
      if (isWritable(_currentProvider)) {
        _currentProvider.value = v;
      }
    },
    peek() {
      _currentProvider = getLatestProvider();
      return (isAtom(_currentProvider) ? _currentProvider.peek() : _currentProvider) as T;
    },
    subscribe: (fn) => {
      // Optimization: Only initialize a long-lived computed atom if there are active subscribers.
      if (!_shared) {
        _shared = $.computed(() => proxyAtom.value);
      }
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
 * Creates a composition-based controller for integrating AEJ reactivity with Custom Elements.
 *
 * When to use:
 * - To build Custom Elements that require reactive attribute synchronization.
 * - To manage complex component lifecycles with automated resource disposal.
 * - To provide or inject reactive state across Shadow DOM boundaries.
 *
 * @param element - The host Custom Element instance.
 * @returns A controller for managing reactivity, attributes, and shadow root.
 *
 * @example
 * ```typescript
 * class MyComponent extends HTMLElement {
 *   private aej = $.useAtomComponent(this);
 *
 *   connectedCallback() {
 *     this.aej.setup();
 *     this.aej.$('.btn').on('click', () => console.log('Action performed'));
 *   }
 *
 *   disconnectedCallback() {
 *     this.aej.teardown();
 *   }
 * }
 * customElements.define('my-component', MyComponent);
 * ```
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  const state = getInternalState(element);
  if (state.controller) {
    return state.controller;
  }

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
      if (typeof selector !== 'string') {
        return $(selector) as JQuery;
      }

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

      // Logic: Notify descendants that providers on this node are no longer available.
      ContextEngine.bump();

      if (!reactive.isInitialized) {
        return;
      }

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

// ─── Context Management API ──────────────────────────────────────────────────

/**
 * Registers an element as a provider for a reactive context value.
 *
 * When to use:
 * - To share state (atoms) with deep descendants without explicit prop drilling.
 * - To establish theme or configuration contexts at specific DOM roots.
 *
 * Logic: Event-Based Discovery
 * Uses the bubbling `aej:context-request` event to resolve dependency
 * requests from descendants. This respects Shadow DOM boundaries through
 * composed event propagation.
 *
 * Logic: CSS Bridge
 * Automatically synchronizes provided atom values with CSS custom properties
 * (`--aej-[key]`), enabling reactive styling based on application state.
 *
 * @param element - The host element, selector, or JQuery collection.
 * @param key - The unique identifier for the context.
 * @param val - The value or atom to be shared.
 *
 * @example
 * ```typescript
 * const theme = $.atom('dark');
 * $.provideAtom('#app-root', 'theme', theme);
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

      el.addEventListener(CONTEXT_REQUEST, (e: Event) => {
        const { key: reqKey, callback } = (e as CustomEvent<ContextRequestDetail>).detail;
        if (state.providers?.has(reqKey)) {
          e.stopPropagation();
          callback(state.providers.get(reqKey));
        }
      });
    }

    state.providers.set(key, val);

    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (v: unknown) => el.style.setProperty(varName, v == null ? '' : String(v));

      if (isAtom(val)) {
        if (!state.providerEffects) {
          state.providerEffects = new Map();
        }
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
 * - To create context-aware components that adapt to their DOM hierarchy position.
 *
 * Logic: Reactive Discovery
 * Returns a reactive proxy that automatically re-locates providers if the
 * element is moved within the DOM.
 *
 * @param element - The requesting element or selector.
 * @param key - The unique identifier of the context to locate.
 * @returns A reactive proxy tracking the nearest provider, or null if the target is invalid.
 *
 * @example
 * ```typescript
 * const theme = $.injectAtom('#sidebar', 'theme');
 * $.effect(() => {
 *   console.log('Active theme:', theme?.value);
 * });
 * ```
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
  if (!target) {
    return null;
  }

  const state = getInternalState(target);
  if (!state.injects) {
    state.injects = new Map();
  }
  let existing = state.injects.get(key);
  if (!existing) {
    existing = createContextProxy<T>(target, key);
    state.injects.set(key, existing);
  }
  return existing as WritableAtom<T>;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
