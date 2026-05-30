/**
 * @module AEJWebComponentEngine
 *
 * Responsibility:
 * Orchestrates the core reactive infrastructure for Custom Elements,
 * including stylesheet caching, dependency injection (DI), and
 * late-bound context resolution.
 *
 * Design Intent:
 * Provides a low-level engine that decouples DOM-based dependency injection
 * from the high-level controller, enabling efficient resource sharing
 * and reactive tracking across the DOM tree.
 */

import { BRAND, BrandFlags, isAtom, isWritable, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { CONTEXT_REQUEST, type ContextRequestDetail } from '@/core/symbols';
import type {
  AtomComponentController,
  AtomComponentStatic,
  EffectObject,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';

export interface NodeInternalState {
  providers?: Map<string | symbol, unknown>;
  providerEffects?: Map<string | symbol, EffectObject>;
  injects?: Map<string | symbol, WritableAtom<unknown>>;
  controller?: AtomComponentController;
}

export interface DebugPortal {
  nodeStateMap: WeakMap<Node, NodeInternalState>;
  sheetCache: Map<string, CSSStyleSheet>;
  version: string;
}

export const nodeStateMap = new WeakMap<Node, NodeInternalState>();
export const sheetCache = new Map<string, CSSStyleSheet>();
export const autoSetupMap = new WeakMap<HTMLElement, AtomComponentStatic>();

export const MAX_SHEET_CACHE_SIZE = 100;

/**
 * Logic: Internal Metadata Tracking
 * Retrieves or initializes the internal metadata state for a node.
 * @internal
 */
export const getInternalState = (node: Node): NodeInternalState => {
  let state = nodeStateMap.get(node);
  if (!state) {
    state = {};
    nodeStateMap.set(node, state);
  }
  return state;
};

/**
 * Optimization: Shared Stylesheet Caching
 * Manages a global cache of CSSStyleSheets to prevent redundant parsing
 * of identical style strings across component instances.
 *
 * @internal
 */
export const getOrCreateSheet = (source: string | CSSStyleSheet): CSSStyleSheet => {
  if (source instanceof CSSStyleSheet) return source;
  let sheet = sheetCache.get(source);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    // Simple FIFO eviction: remove the first added entry if cache exceeds limit.
    // Note: Map.keys().next().value returns the first inserted key (FIFO order).
    if (sheetCache.size >= MAX_SHEET_CACHE_SIZE) {
      const firstKey = sheetCache.keys().next().value;
      if (firstKey !== undefined) sheetCache.delete(firstKey);
    }
    sheetCache.set(source, sheet);
  }
  return sheet;
};

/**
 * Logic: Reactive Dependency Injection
 * Internal singleton that coordinates Dependency Injection (DI) across the DOM.
 *
 * Role: Context Orchestrator
 * Manages the versioning and observation of the DOM tree to invalidate
 * late-bound context proxies when elements move.
 *
 * @internal
 */
export const ContextEngine = (() => {
  const version = $.atom(0);
  let isBumpPending = false;
  let observer: MutationObserver | null = null;
  let activeCount = 0;

  const bump = () => {
    if (isBumpPending) return;
    isBumpPending = true;
    queueMicrotask(() => {
      version.value++;
      isBumpPending = false;
    });
  };

  const init = (el: HTMLElement) => {
    const specs = autoSetupMap.get(el);
    if (specs) {
      // Logic: Atomic Take & Release
      autoSetupMap.delete(el);
      ContextEngine.release();

      const ctrl = nodeStateMap.get(el)?.controller;
      if (ctrl) {
        ctrl.setup({
          ...(specs.aejStyles && { styles: specs.aejStyles }),
          ...(specs.aejBind && { bind: specs.aejBind }),
          ...(specs.aejAria && { aria: specs.aejAria }),
          ...(specs.aejParts && { parts: specs.aejParts }),
          ...(specs.aejDispatch && { dispatch: specs.aejDispatch }),
          ...(specs.aejValue && { value: specs.aejValue }),
          ...(specs.aejValidation && { validation: specs.aejValidation }),
        });
      }
    }
  };

  const ensureObserver = () => {
    if (observer || typeof document === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      let needsBump = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          needsBump = true;
          for (const node of m.addedNodes) {
            if (node instanceof HTMLElement) {
              init(node);
              const children = node.querySelectorAll('*');
              for (const child of children) {
                init(child as HTMLElement);
              }
            }
          }
        }
        if (m.removedNodes.length > 0) needsBump = true;
      }
      if (needsBump) bump();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const releaseObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  return {
    get version() {
      return version;
    },
    bump,
    retain() {
      activeCount++;
      if (activeCount === 1) ensureObserver();
    },
    release() {
      activeCount--;
      if (activeCount === 0) releaseObserver();
    },
    /**
     * Resolves a context key by dispatching a bubbling DOM event.
     * Contract: This method RELIES on synchronous event dispatch.
     */
    discover(target: HTMLElement, key: string | symbol): unknown | undefined {
      // Fast-path: direct parent pointer walk crossing Shadow DOM boundaries
      let curr: Node | null = target;
      while (curr) {
        const state = nodeStateMap.get(curr);
        if (state?.providers?.has(key)) {
          return state.providers.get(key);
        }
        curr = curr instanceof ShadowRoot ? curr.host : curr.parentNode;
      }

      // Fallback path: event-based resolution
      let found: unknown | undefined;
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
})();

/**
 * Logic: Reactive Context Proxy
 * Creates a reactive proxy that follows a context value as it moves in the DOM.
 *
 * Logic: Late-Bound Tracking
 * Tracks `ContextEngine.version` to ensure that cached values are
 * invalidated if the element is moved within the DOM hierarchy.
 *
 * @internal
 */
export function createContextProxy<T>(target: HTMLElement, key: string | symbol): WritableAtom<T> {
  const resolve = (isPeek: boolean) => {
    if (isPeek) ContextEngine.version.peek();
    else ContextEngine.version.value;
    return untracked(() => ContextEngine.discover(target, key)) as WritableAtom<T> | T | undefined;
  };

  const getLiveValue = (isPeek: boolean) => {
    const p = resolve(isPeek);
    if (p === undefined) return null as T;
    return (isAtom(p) ? (isPeek ? p.peek() : p.value) : p) as T;
  };

  let sharedAtom: ReadonlyAtom<T> | null = null;
  const getShared = () => {
    if (!sharedAtom) sharedAtom = $.computed(() => getLiveValue(false));
    return sharedAtom;
  };

  return {
    get value() {
      return getLiveValue(false);
    },
    set value(v: T) {
      const p = resolve(true);
      if (p !== undefined && isWritable(p)) {
        p.value = v;
      }
    },
    peek() {
      return getLiveValue(true);
    },
    subscribe: (fn) => {
      ContextEngine.retain();
      const unsub = getShared().subscribe(fn);
      return () => {
        unsub();
        ContextEngine.release();
      };
    },
    subscriberCount: () => (sharedAtom ? sharedAtom.subscriberCount() : 0),
    dispose: () => {
      if (sharedAtom) {
        sharedAtom.dispose();
        sharedAtom = null;
      }
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T>;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __AEJ_INTERNAL__: DebugPortal }).__AEJ_INTERNAL__ = {
    nodeStateMap,
    sheetCache,
    version: '0.33.0',
  };
}
