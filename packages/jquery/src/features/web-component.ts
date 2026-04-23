import { BRAND, BrandFlags, isAtom, isWritable, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type {
  AtomComponentController,
  EffectObject,
  ReactiveValue,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';

// ─── Constants & Types ───────────────────────────────────────────────────────

/** Internal symbol used to track if an element has been hydrated. @internal */
const HYDRATION_MARKER = Symbol.for('aej:hydrated');

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
 * structure changes. Throttling version bumps to the scheduler's next
 * cycle ensures synchronization with other reactive updates.
 */
if (typeof document !== 'undefined') {
  let isBumpPending = false;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
      if (isBumpPending) return;
      isBumpPending = true;
      // Logic: Use microtask for throttling, but rely on atom's built-in scheduling for flushes.
      queueMicrotask(() => {
        ContextEngine.bump();
        isBumpPending = false;
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
      _currentProvider = untracked(getLatestProvider);
      return (isAtom(_currentProvider) ? _currentProvider.value : _currentProvider) as T;
    },
    set value(v: T) {
      _currentProvider = untracked(getLatestProvider);
      if (isWritable(_currentProvider)) {
        _currentProvider.value = v;
      }
    },
    peek() {
      _currentProvider = untracked(getLatestProvider);
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
 * Composition-based helper for building reactive Web Components.
 *
 * When to use:
 * - When building standard Custom Elements that require reactive state and DI.
 * - To orchestrate attribute, slot, and template hydration logic within a single lifecycle.
 *
 * Logic: Composition Model
 * Returns a controller that manages the component's internal reactive state,
 * including lazy-initialized atoms for attributes and slots.
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
 *     // Logic: Initializes observers and hydration
 *     this.aej.setup({
 *        bind: { title: someAtom }
 *     });
 *   }
 *
 *   disconnectedCallback() {
 *     // Logic: Deterministic cleanup of all effects and listeners
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
    attributeAtom: null as WritableAtom<Record<string, string | null>> | null,
    attributeObserver: null as MutationObserver | null,
    attributeLenses: new Map<string, WritableAtom<string | null>>(),
    slotsAtom: null as WritableAtom<Record<string, Node[]>> | null,
    slotLenses: new Map<string, WritableAtom<Node[]>>(),
    slotListeners: new Map<string, (e: Event) => void>(),
    dispatchEffects: new Set<EffectObject>(),
    hydrationEffects: new Set<EffectObject>(),
  };

  const ensureAttributeObserver = () => {
    if (reactive.attributeObserver) return;

    const initialAttrs: Record<string, string | null> = {};
    for (const attr of element.attributes) {
      initialAttrs[attr.name] = attr.value;
    }
    reactive.attributeAtom = $.atom(initialAttrs);

    const observed =
      (
        element.constructor as typeof HTMLElement & {
          observedAttributes?: string[];
        }
      ).observedAttributes || [];

    reactive.attributeObserver = new MutationObserver(() => {
      const nextAttrs: Record<string, string | null> = {};
      for (const attr of element.attributes) {
        nextAttrs[attr.name] = attr.value;
      }
      reactive.attributeAtom!.value = nextAttrs;
    });

    const options: MutationObserverInit = { attributes: true };
    if (observed.length > 0) {
      options.attributeFilter = observed;
    }
    reactive.attributeObserver.observe(element, options);
  };

  const ensureSlotsTracking = () => {
    if (reactive.slotsAtom) return;

    const sr = element.shadowRoot;
    const initialSlots: Record<string, Node[]> = {};

    if (sr) {
      const slots = sr.querySelectorAll('slot');
      slots.forEach((slot) => {
        const name = slot.name || '';
        initialSlots[name] = slot.assignedNodes();
      });

      const listener = (e: Event) => {
        const target = e.target as HTMLSlotElement;
        const name = target.name || '';
        reactive.slotsAtom!.value = {
          ...reactive.slotsAtom!.peek(),
          [name]: target.assignedNodes(),
        };
      };
      sr.addEventListener('slotchange', listener);
      reactive.slotListeners.set('all', listener);
    }

    reactive.slotsAtom = $.atom(initialSlots);
  };

  const controller: AtomComponentController = {
    host: element,

    get root() {
      return reactive.root;
    },

    get attrs() {
      ensureAttributeObserver();
      return (name: string) => {
        let lens = reactive.attributeLenses.get(name);
        if (!lens) {
          lens = $.atomLens(reactive.attributeAtom!, name);
          reactive.attributeLenses.set(name, lens);
        }
        return lens;
      };
    },

    get slots() {
      ensureSlotsTracking();
      return (name: string) => {
        const key = name === 'default' ? '' : name;
        let lens = reactive.slotLenses.get(key);
        if (!lens) {
          lens = $.atomLens(reactive.slotsAtom!, key) as WritableAtom<Node[]>;
          reactive.slotLenses.set(key, lens);
        }
        return lens as ReadonlyAtom<Node[]>;
      };
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

    setup(
      options?:
        | ShadowRoot
        | {
            shadowRoot?: ShadowRoot;
            dispatch?: Record<string, ReactiveValue<unknown>>;
            bind?: Record<string, ReadonlyAtom<unknown>>;
          }
    ) {
      if (reactive.isInitialized) {
        const incomingSR = options instanceof Node ? options : options?.shadowRoot;
        if (incomingSR && incomingSR !== reactive.root) {
          throw new Error('Call teardown() first.');
        }
        return;
      }

      const config =
        options instanceof Node ? { shadowRoot: options as ShadowRoot } : options || {};
      const sr = config.shadowRoot || element.shadowRoot;

      if (sr) {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      }

      reactive.root = (sr ?? element) as Node & { [CLEANUP_MARKER]?: boolean };
      if (!reactive.root![CLEANUP_MARKER]) {
        enableAutoCleanup(reactive.root as Element);
        reactive.root![CLEANUP_MARKER] = true;
      }

      // 1. Reactive Dispatch
      if (config.dispatch) {
        setupDispatch(element, config.dispatch, reactive);
      }

      // 2. Declarative Hydration (Synthesis: Dynamic & Robust)
      if (config.bind) {
        hydrate(reactive.root as Element, config.bind, reactive);
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

      reactive.dispatchEffects.forEach((e) => e.dispose());
      reactive.dispatchEffects.clear();
      reactive.hydrationEffects.forEach((e) => e.dispose());
      reactive.hydrationEffects.clear();

      reactive.isInitialized = false;
      reactive.attributeObserver?.disconnect();
      reactive.attributeObserver = null;
      reactive.attributeAtom = null;
      reactive.attributeLenses.clear();

      const sr = element.shadowRoot;
      if (sr) {
        reactive.slotListeners.forEach((listener) => {
          sr.removeEventListener('slotchange', listener);
        });
      }
      reactive.slotListeners.clear();
      reactive.slotsAtom = null;
      reactive.slotLenses.clear();

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

// ─── Internal Evolution Helpers ──────────────────────────────────────────────

/**
 * Orchestrates declarative event dispatching for a component.
 *
 * Logic: Reactive Dispatch
 * Monitors a set of reactive values and automatically dispatches a matching
 * CustomEvent whenever a value changes.
 *
 * Logic: Polymorphic Input
 * Supports reactive atoms for state-driven updates, functional getters for
 * deferred execution, or static values.
 *
 * @internal
 */
function setupDispatch(
  element: HTMLElement,
  mappings: Record<string, ReactiveValue<unknown>>,
  state: { dispatchEffects: Set<EffectObject> }
) {
  for (const [eventName, source] of Object.entries(mappings)) {
    const effect = $.effect(() => {
      const value = isAtom(source)
        ? source.value
        : typeof source === 'function'
          ? (source as Function)()
          : source;

      // Logic: Polymorphic Detail
      // If source is a function returning an object, use it directly as detail.
      // Otherwise, wrap the primitive or atom value in a { value } object for consistency.
      const detail =
        typeof source === 'function' && typeof value === 'object' && value !== null
          ? value
          : { value };

      element.dispatchEvent(
        new CustomEvent(eventName, {
          detail,
          bubbles: true,
          composed: true,
        })
      );
      return undefined;
    });
    state.dispatchEffects.add(effect);
  }
}

/**
 * Performs dynamic hydration of reactive markers within a component's root.
 *
 * When to use:
 * - Recommended for components that require data-binding between application
 *   state (Atoms) and the DOM without manual manipulation.
 *
 * Logic: Dynamic Hydration
 * Combines initial tree-walking with a MutationObserver to ensure that nodes
 * added dynamically after setup() are correctly bound to their respective atoms.
 *
 * Security: Text Injection
 * Uses `textContent` for updates to prevent XSS vulnerabilities. HTML injection
 * is explicitly avoided in the default hydration logic.
 *
 * @internal
 */
function hydrate(
  root: Element,
  bindings: Record<string, ReadonlyAtom<unknown>>,
  state: { hydrationEffects: Set<EffectObject>; root?: Node | null }
) {
  const BIND_ATTRS = ['data-aej-bind', 'data-bind'];
  const selector = BIND_ATTRS.map((a) => `[${a}]`).join(',');

  const applyTo = (node: Element) => {
    const target = node as Element & { [HYDRATION_MARKER]?: boolean };
    // Only bind if not already bound (idempotency)
    if (target[HYDRATION_MARKER]) return;

    for (const attr of BIND_ATTRS) {
      const key = node.getAttribute(attr);
      if (key && bindings[key]) {
        const atom = bindings[key];
        const effect = $.effect(() => {
          const val = isAtom(atom) ? atom.value : atom;
          node.textContent = val == null ? '' : String(val);
          return undefined;
        });
        state.hydrationEffects.add(effect);
        target[HYDRATION_MARKER] = true;
        break;
      }
    }
  };

  // Initial scan
  $(root)
    .find(selector)
    .addBack(selector)
    .each((_, el) => applyTo(el));

  // Dynamic observation for structural changes
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          if (node.matches(selector)) applyTo(node);
          $(node)
            .find(selector)
            .each((_, el) => applyTo(el));
        }
      });
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  // Use a dedicated effect for observer management to align with core lifecycle
  const observerCleanup = $.effect(() => {
    return () => observer.disconnect();
  });
  state.hydrationEffects.add(observerCleanup);
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
