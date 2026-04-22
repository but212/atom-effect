import { BRAND, BrandFlags, isAtom, isWritable } from '@but212/atom-effect';
import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type { AtomComponentController, EffectObject, WritableAtom } from '@/types';

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
  /** Track effects used for CSS Bridge to ensure cleanup on override. */
  providerEffects?: Map<string | symbol, EffectObject>;
  /**
   * Cache for injected atoms to prevent redundant proxy creation.
   * Logic: Data locality ensures that cache follows the node lifecycle naturally.
   */
  injects?: Map<
    string | symbol,
    { globalVer: number; keyVer: number; atom: WritableAtom<unknown> }
  >;
}

/** @internal */
type AEJNode = Node & { [AEJ_STATE]?: AEJState; [CLEANUP_MARKER]?: boolean };

/**
 * Central coordination for reactive context versioning.
 * @internal
 */
const contextRegistry = {
  globalVersion: $.atom(0),
  keyVersions: new Map<string | symbol, WritableAtom<number>>(),

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
   * Logic: Validates cached atoms against current global and key versions.
   */
  getCache<T>(node: HTMLElement, key: string | symbol): WritableAtom<T> | null {
    const entry = getAEJState(node)?.injects?.get(key);
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
   * Stores a proxy atom with a version snapshot to detect stale lookups.
   */
  setCache(node: HTMLElement, key: string | symbol, atom: WritableAtom<unknown>) {
    const s = getAEJState(node, true)!;
    if (!s.injects) s.injects = new Map();
    s.injects.set(key, {
      globalVer: this.globalVersion.value,
      keyVer: this.getVersion(key).value,
      atom,
    });
  },
};

let isBumpPending = false;
const globalTreeObserver = new MutationObserver((mutations) => {
  if (mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
    if (isBumpPending) return;
    isBumpPending = true;
    queueMicrotask(() => {
      contextRegistry.bump();
      isBumpPending = false;
    });
  }
});

if (typeof document !== 'undefined') {
  globalTreeObserver.observe(document.documentElement, { childList: true, subtree: true });
}

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
 * Traverses the composed tree to find the nearest ancestor providing a key.
 *
 * Logic: Starts from the parent node to prevent an element from injecting
 * a context it provides itself (unless provided via a shadow host).
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
      // Logic: Traverse up through the shadow host for web components.
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
  let _shared: WritableAtom<T> | null = null;

  const getShared = () => {
    if (!_shared) {
      _shared = $.computed(() => {
        // Optimization: Track versions to ensure effect re-runs on provider changes
        contextRegistry.globalVersion.value;
        contextRegistry.getVersion(key).value;

        const provider = findContext(target, key);
        return (isAtom(provider) ? provider.value : provider) as T;
      });
    }
    return _shared;
  };

  const proxyAtom: WritableAtom<T> = {
    get value() {
      // Optimization: Synchronous tracking for immediate reactivity.
      contextRegistry.globalVersion.value;
      contextRegistry.getVersion(key).value;

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
    subscribe: (fn) => getShared().subscribe(fn),
    subscriberCount: () => (_shared ? _shared.subscriberCount() : 0),
    dispose: () => {
      if (_shared) {
        _shared.dispose();
        _shared = null;
      }
    },

    // Core Harmony: Branded to satisfy core type guards (isAtom/isWritable).
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T>;

  return proxyAtom;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Composition-based controller for AEJ-powered Web Components.
 *
 * When to use:
 * - When building Custom Elements that need reactive state and scoped jQuery selection.
 * - To manage complex component lifecycles with automatic resource cleanup.
 *
 * @param element - The host Custom Element instance.
 * @returns A controller for managing reactivity, providers, and shadow root.
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
    attributeAtoms: new Map<string, WritableAtom<string | null>>(),
    attributeObserver: null as MutationObserver | null,
    treeObserver: null as MutationObserver | null,
    attrsRecord: null as Record<string, WritableAtom<string | null>> | null,
  };

  const controller: AtomComponentController = {
    host: element,

    get root() {
      return reactive.root;
    },

    get attrs() {
      if (!reactive.attrsRecord) {
        const observed =
          (element.constructor as { observedAttributes?: string[] }).observedAttributes || [];
        const result: Record<string, WritableAtom<string | null>> = {};

        for (const name of observed) {
          let atom = reactive.attributeAtoms.get(name);
          if (!atom) {
            atom = $.atom(element.getAttribute(name));
            reactive.attributeAtoms.set(name, atom);
          }
          result[name] = atom;
        }
        reactive.attrsRecord = result;
      }
      return reactive.attrsRecord;
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

    injectAtom<T = unknown>(key: string | symbol): WritableAtom<T> | null {
      return injectAtom(element, key);
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
        let isRootBumpPending = false;
        reactive.treeObserver = new MutationObserver(() => {
          if (isRootBumpPending) return;
          isRootBumpPending = true;
          queueMicrotask(() => {
            contextRegistry.bump();
            isRootBumpPending = false;
          });
        });
        reactive.treeObserver.observe(sr, { childList: true, subtree: true });
      }

      reactive.root = (sr ?? element) as AEJNode;

      // Logic: Hook into attribute changes if observedAttributes are defined
      const observed =
        (element.constructor as { observedAttributes?: string[] }).observedAttributes || [];
      if (observed.length > 0 && !reactive.attributeObserver) {
        reactive.attributeObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName) {
              const atom = reactive.attributeAtoms.get(m.attributeName);
              if (atom) atom.value = element.getAttribute(m.attributeName);
            }
          }
        });
        reactive.attributeObserver.observe(element, {
          attributes: true,
          attributeFilter: observed,
        });
      }

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

      if (state.providerEffects) {
        for (const effect of state.providerEffects.values()) effect.dispose();
        state.providerEffects.clear();
      }

      if (!reactive.isInitialized) return;

      // Logic: Flag is set to false BEFORE cleanup to prevent re-entry if cleanup throws.
      reactive.isInitialized = false;

      if (reactive.attributeObserver) {
        reactive.attributeObserver.disconnect();
        reactive.attributeObserver = null;
      }

      if (reactive.treeObserver) {
        reactive.treeObserver.disconnect();
        reactive.treeObserver = null;
      }

      reactive.attrsRecord = null;

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
 * Registers an element as a provider for a reactive context value.
 *
 * When to use:
 * - When you need to share state (atoms) with deep descendant elements without prop drilling.
 * - To establish theme or configuration contexts at specific DOM roots.
 *
 * @param element - The host element, selector, or JQuery collection.
 * @param key - Unique identifier for the context (string or symbol).
 * @param val - The value or Atom to be shared.
 *
 * @example
 * const theme = $.atom('dark');
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

    // Logic: If overriding a provider, clean up the old CSS Bridge effect.
    if (s.providerEffects?.has(key)) {
      s.providerEffects.get(key)!.dispose();
      s.providerEffects.delete(key);
    }

    s.providers.set(key, val);

    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (v: unknown) => {
        el.style.setProperty(varName, v === null || v === undefined ? '' : String(v));
      };

      if (isAtom(val)) {
        if (!s.providerEffects) s.providerEffects = new Map();
        s.providerEffects.set(
          key,
          $.effect(() => {
            sync(val.value);
            return undefined;
          })
        );
      } else {
        sync(val);
      }
    }
  }
  // Reason: Notify lookups for this specific key.
  contextRegistry.bump(key);
}

/**
 * Injects a reactive context provided by an ancestor element.
 *
 * When to use:
 * - To consume state from an ancestor without direct coupling.
 * - To create "Context-Aware" components that adapt to their position in the DOM.
 *
 * @param element - The element or selector requesting the context.
 * @param key - The unique identifier of the context to find.
 * @returns A WritableAtom proxy tracking the nearest provider.
 *
 * @example
 * const theme = $.injectAtom('#child', 'theme');
 * $.effect(() => {
 *   console.log('Active theme:', theme?.value);
 *   return undefined;
 * });
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

  const proxyAtom = createContextProxy<T>(target, key);
  contextRegistry.setCache(target, key, proxyAtom);
  return proxyAtom;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
