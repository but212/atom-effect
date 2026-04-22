import { BRAND, BrandFlags, isAtom, isWritable } from '@but212/atom-effect';
import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type { AtomComponentController, WritableAtom } from '@/types';

// ─── Symbols & Internal Types ───────────────────────────────────────────────

/**
 * Keyed slot for AEJ state attached directly to DOM nodes.
 * @internal
 */
const AEJ_STATE = Symbol.for('aej:state');

/**
 * Marker for MutationObserver activity.
 * @internal
 */
const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');

/** @internal */
interface AEJState {
  controller?: AtomComponentController;
  providers?: Map<string | symbol, unknown>;
}

/** @internal */
type AEJNode = Node & { [AEJ_STATE]?: AEJState; [CLEANUP_MARKER]?: boolean };

// ─── Context Registry (Data Structure) ───────────────────────────────────────

/**
 * Encapsulates the reactive context's versioning and caching logic.
 *
 * Optimization: Uses a version-aware WeakMap cache to prevent redundant tree
 * traversals while ensuring that provider overrides and DOM movements are
 * detected via version checks.
 *
 * Rule 5: Data dominates. Centralizing the state makes the algorithms self-evident.
 * @internal
 */
const contextRegistry = {
  globalVersion: $.atom(0),
  keyVersions: new Map<string | symbol, WritableAtom<number>>(),

  /**
   * Cache structure: Node -> Key -> { versions, instance }
   * Optimization: WeakMap ensures that cache entries are collected along with the Node.
   */
  injectCache: new WeakMap<
    Node,
    Map<string | symbol, { globalVer: number; keyVer: number; atom: WritableAtom<unknown> }>
  >(),

  /**
   * Retrieves or initializes a version tracker for a specific context key.
   */
  getVersion(key: string | symbol) {
    let v = this.keyVersions.get(key);
    if (!v) {
      v = $.atom(0);
      this.keyVersions.set(key, v);
    }
    return v;
  },

  /**
   * Increments versions to trigger re-evaluations of injected atoms.
   */
  bump(key?: string | symbol) {
    if (key) {
      this.getVersion(key).value++;
    } else {
      this.globalVersion.value++;
    }
  },

  /**
   * Logic: Checks if a cached atom exists and is still valid based on current versions.
   */
  getCache<T>(node: Node, key: string | symbol): WritableAtom<T> | null {
    const entry = this.injectCache.get(node)?.get(key);
    if (
      entry &&
      entry.globalVer === this.globalVersion.value &&
      entry.keyVer === this.getVersion(key).value
    ) {
      return entry.atom as WritableAtom<T>;
    }
    return null;
  },

  /**
   * Stores an atom in the cache with the current version snapshots.
   */
  setCache(node: Node, key: string | symbol, atom: WritableAtom<unknown>) {
    let nodeMap = this.injectCache.get(node);
    if (!nodeMap) {
      nodeMap = new Map();
      this.injectCache.set(node, nodeMap);
    }
    nodeMap.set(key, {
      globalVer: this.globalVersion.value,
      keyVer: this.getVersion(key).value,
      atom: atom as WritableAtom<unknown>,
    });
  },
};

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Accesses or initializes the internal state slot on a DOM node.
 * @internal
 */
const getAEJState = (node: Node, create = false): AEJState | undefined => {
  const n = node as AEJNode;
  if (!n[AEJ_STATE] && create) n[AEJ_STATE] = {};
  return n[AEJ_STATE];
};

/**
 * Traverses the composed tree to find a provided context value.
 *
 * Logic: Starts from the parent node to prevent an element from injecting
 * a context it provides itself (unless provided by a shadow host).
 *
 * @internal
 */
function findContext(target: HTMLElement, key: string | symbol): unknown | null {
  let curr: Node | null = target.parentNode;

  while (curr) {
    const providers = (curr as AEJNode)[AEJ_STATE]?.providers;
    if (providers?.has(key)) return providers.get(key);

    const next: Node | null = curr.parentNode;
    if (next) {
      curr = next;
    } else if (curr.nodeType === 11) {
      // DocumentFragment / ShadowRoot: Traverse up through the shadow host
      curr = (curr as ShadowRoot).host || null;
    } else {
      curr = null;
    }
  }

  return null;
}

/**
 * Creates a reactive proxy for a context value.
 *
 * Optimization: Uses a manual getter/setter instead of a computed for the main
 * value to ensure immediate freshness when the DOM tree structure changes.
 *
 * @internal
 */
function createContextProxy<T>(target: HTMLElement, key: string | symbol): WritableAtom<T> {
  const proxyAtom: WritableAtom<T> = {
    get value() {
      // Reactivity: Track versions to ensure effect re-runs on provider changes
      contextRegistry.globalVersion.value;
      contextRegistry.getVersion(key).value;

      // Freshness: Perform a synchronous lookup to catch DOM moves
      const provider = findContext(target, key);
      return (isAtom(provider) ? provider.value : provider) as T;
    },
    set value(v: T) {
      const provider = findContext(target, key);
      if (isWritable(provider)) {
        provider.value = v;
      }
    },
    peek() {
      const provider = findContext(target, key);
      return (isAtom(provider) ? provider.peek() : provider) as T;
    },
    subscribe: (fn) => {
      // Logic: Bridge the dynamic lookup to standard subscribers via a computed
      const lookup = $.computed(() => proxyAtom.value);
      return lookup.subscribe(fn);
    },
    subscriberCount: () => 0,
    dispose: () => {},

    // Core Harmony: Officially branded to satisfy core type guards (isAtom/isWritable)
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T>;

  return proxyAtom;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Composition-based helper for creating AEJ-powered Web Components.
 *
 * When to use:
 * - When building standard Custom Elements with reactive state and scoped selection.
 * - When you want perfect type safety and predictable lifecycle management for components.
 *
 * @param element - The host Custom Element (usually `this`).
 * @returns A controller for managing reactive lifecycle, providers, and scoped root.
 *
 * @example
 * class MyComponent extends HTMLElement {
 *   // Capture 'this' as the reactive host
 *   private aej = $.useAtomComponent(this);
 *
 *   connectedCallback() {
 *     // Initialize shadow root and registry
 *     this.aej.setup();
 *     this.aej.$('button').on('click', () => console.log('Clicked!'));
 *   }
 *
 *   disconnectedCallback() {
 *     // Clean up providers and observers
 *     this.aej.teardown();
 *   }
 * }
 * customElements.define('my-component', MyComponent);
 *
 * @public
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  const state = getAEJState(element, true)!;
  if (state.controller) return state.controller;

  // Reason: Consolidate internal state to ensure teardown atomicity.
  const reactive = {
    root: null as AEJNode | null,
    isInitialized: false,
  };

  const controller: AtomComponentController = {
    host: element,

    get root() {
      return reactive.root;
    },

    $: (selector, context) => {
      const root = reactive.root || element;
      if (typeof selector !== 'string') return $(selector) as JQuery;

      const ctx = context || root;

      if (ctx instanceof DocumentFragment) {
        // Logic: Standard jQuery selection fails on ShadowRoots; fallback to querySelectorAll.
        return $(Array.from(ctx.querySelectorAll<HTMLElement>(selector))) as JQuery;
      }

      return $(selector, ctx) as JQuery;
    },

    provideAtom(key: string | symbol, val: unknown) {
      provideAtom(element, key, val);
    },

    injectAtom<T = unknown>(key: string | symbol): T | null {
      const atom = injectAtom(element, key);
      return atom ? (atom.value as T) : null;
    },

    setup(shadowRoot?: ShadowRoot) {
      if (reactive.isInitialized) {
        // Constraint: Prevent re-initialization with different roots without teardown
        if (shadowRoot && shadowRoot !== reactive.root) {
          throw new Error('Call teardown() before setting up with a different shadowRoot.');
        }
        return;
      }

      const sr = shadowRoot || element.shadowRoot;
      if (sr) {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      }

      reactive.root = (sr ?? element) as AEJNode;

      if (!reactive.root[CLEANUP_MARKER]) {
        enableAutoCleanup(reactive.root as Element | ShadowRoot);
        reactive.root[CLEANUP_MARKER] = true;
      }

      reactive.isInitialized = true;
      // Reason: Notify injected atoms that the host might now have a shadow root or be connected.
      contextRegistry.bump();
    },

    teardown() {
      // Reason: Providers are independent of `setup()` lifecycle, so they must
      // be cleared even if the component wasn't formally initialized.
      if (state.providers) {
        const keys = Array.from(state.providers.keys());
        state.providers.clear();
        for (const k of keys) contextRegistry.bump(k);
      }

      if (!reactive.isInitialized) return;

      // Logic: Flag is set to false BEFORE cleanup to prevent re-entry if cleanup throws.
      reactive.isInitialized = false;

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

/**
 * Registers an element (or multiple) as a provider for a reactive context value.
 *
 * When to use:
 * - When you need to share state (atoms) with deep descendant elements without prop drilling.
 * - To establish a theme, user session, or global configuration context at a specific root.
 *
 * @param element - The host element, selector, or JQuery collection to act as provider.
 * @param key - Unique identifier for the context (string or symbol).
 * @param val - The value (usually an Atom) to be shared with descendants.
 *
 * @example
 * // Parent provides a theme atom
 * const theme = $.atom('light');
 * $.provideAtom('#app-root', 'theme', theme);
 *
 * @public
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
    const s = getAEJState(el, true)!;
    if (!s.providers) s.providers = new Map();
    s.providers.set(key, val);
  }
  // Reason: Notify lookups for this specific key.
  contextRegistry.bump(key);
}

/**
 * Injects a reactive context provided by an ancestor element.
 *
 * When to use:
 * - To consume state provided by a parent/ancestor component without direct coupling.
 * - To create "Context-Aware" components that adapt to their position in the DOM.
 *
 * @param element - The element or selector requesting the context.
 * @param key - The unique identifier of the context to find.
 * @returns A WritableAtom proxy that tracks the nearest ancestor provider.
 *
 * @example
 * // Child consumes the provided theme
 * const theme = $.injectAtom('#child-element', 'theme');
 * if (theme) {
 *   $.effect(() => {
 *     console.log('Current theme:', theme.value);
 *   });
 * }
 *
 * @public
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

  const cached = contextRegistry.getCache<T>(target, key);
  if (cached) return cached;

  const initial = findContext(target, key);

  // Optimization: Return the original atom instance directly if available to satisfy
  // identity-based tests and maintain direct writability to the source atom.
  if (isAtom(initial)) {
    contextRegistry.setCache(target, key, initial);
    return initial as WritableAtom<T>;
  }

  const proxyAtom = createContextProxy<T>(target, key);
  contextRegistry.setCache(target, key, proxyAtom);
  return proxyAtom;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
