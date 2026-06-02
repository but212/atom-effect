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

import {
  BRAND,
  BrandFlags,
  type EffectObject,
  isAtom,
  isWritable,
  untracked,
} from '@but212/atom-effect';
import $ from 'jquery';
import { CONTEXT_REQUEST, type ContextRequestDetail } from '@/core/symbols';
import type {
  AtomComponentController,
  AtomComponentStatic,
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
        const opts: Parameters<AtomComponentController['setup']>[0] = {};
        if (specs.aejStyles !== undefined) opts.styles = specs.aejStyles;
        if (specs.aejBind !== undefined) opts.bind = specs.aejBind;
        if (specs.aejAria !== undefined) opts.aria = specs.aejAria;
        if (specs.aejParts !== undefined) opts.parts = specs.aejParts;
        if (specs.aejDispatch !== undefined) opts.dispatch = specs.aejDispatch;
        if (specs.aejValue !== undefined) opts.value = specs.aejValue;
        if (specs.aejValidation !== undefined) opts.validation = specs.aejValidation;
        ctrl.setup(opts);
      }
    }
  };

  const ensureObserver = () => {
    if (observer || typeof document === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      let needsBump = false;
      for (const { addedNodes, removedNodes } of mutations) {
        if (addedNodes.length) {
          needsBump = true;
          for (const node of addedNodes) {
            if (node instanceof HTMLElement) {
              init(node);
              for (const child of node.querySelectorAll('*')) {
                init(child as HTMLElement);
              }
            }
          }
        }
        if (removedNodes.length) needsBump = true;
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
  let sharedAtom: ReadonlyAtom<T> | null = null;

  const resolve = (isPeek: boolean) => {
    if (!isPeek) ContextEngine.version.value;
    const p = untracked(() => ContextEngine.discover(target, key));
    if (p === undefined) return null as T;
    return (isAtom(p) ? (isPeek ? p.peek() : p.value) : p) as T;
  };

  const getShared = () => {
    if (!sharedAtom) sharedAtom = $.computed(() => resolve(false));
    return sharedAtom;
  };

  return {
    get value() {
      return resolve(false);
    },
    set value(v: T) {
      const p = untracked(() => ContextEngine.discover(target, key));
      if (p !== undefined && isWritable(p)) {
        p.value = v;
      }
    },
    peek() {
      return resolve(true);
    },
    subscribe(fn) {
      ContextEngine.retain();
      const unsub = getShared().subscribe(fn);
      return () => {
        unsub();
        ContextEngine.release();
      };
    },
    subscriberCount: () => (sharedAtom ? sharedAtom.subscriberCount() : 0),
    dispose() {
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
    version: '0.33.1',
  };
}
