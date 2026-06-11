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

import { BRAND, BrandFlags, type EffectObject, isAtom, isWritable } from '@but212/atom-effect';
import $ from 'jquery';
import type { AtomComponentController, WritableAtom } from '@/types';

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
 * Logic: Reactive Dependency Discovery
 * Walks the DOM tree upwards (including crossing Shadow DOM boundaries)
 * to locate a reactive provider matching the given key.
 *
 * Design Intent:
 * Pure, synchronous DOM traversal. Removes the need for global mutation observers
 * or asynchronous event bubbling, enabling completely deterministic and memory-safe
 * context resolution.
 *
 * @internal
 */
export const discoverProvider = (target: Node, key: string | symbol): unknown | undefined => {
  let curr: Node | null = target;
  while (curr) {
    const state = nodeStateMap.get(curr);
    if (state?.providers?.has(key)) {
      return state.providers.get(key);
    }
    curr = curr instanceof ShadowRoot ? curr.host : curr.parentNode;
  }
  return undefined;
};

/**
 * Logic: Reactive Context Proxy
 * Creates a reactive proxy that resolves its target provider synchronously
 * on every access.
 *
 * Design Intent:
 * Drops global state versioning. By traversing the DOM upon access,
 * the proxy ensures it always resolves to the current location's provider
 * without maintaining tracking state.
 *
 * @internal
 */
export function createContextProxy<T>(
  target: HTMLElement,
  key: string | symbol
): WritableAtom<T | null> {
  const resolve = (isPeek: boolean): T | null => {
    const p = discoverProvider(target, key);
    if (p === undefined) return null;
    return (isAtom(p) ? (isPeek ? p.peek() : p.value) : p) as T;
  };

  return {
    get value() {
      return resolve(false);
    },
    set value(v: T | null) {
      const p = discoverProvider(target, key);
      if (p !== undefined && isWritable(p)) {
        p.value = v;
      }
    },
    peek() {
      return resolve(true);
    },
    subscribe(fn) {
      // In this stateless model, we create a temporary computed that captures the current
      // resolution value and subscribe to it. If the user wants to react to *movement* in the DOM,
      // they must explicitly re-evaluate or use a component lifecycle hook.
      // This enforces explicit bounds over implicit magical DOM tracking.
      const shared = $.computed(() => resolve(false));
      const unsub = shared.subscribe(fn);
      return () => {
        unsub();
        shared.dispose();
      };
    },
    subscriberCount: () => 0, // Proxy has no permanent subscribers.
    dispose() {
      // No permanent resources to free in the proxy itself.
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T | null>;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __AEJ_INTERNAL__: DebugPortal }).__AEJ_INTERNAL__ = {
    nodeStateMap,
    sheetCache,
    version: '0.33.1',
  };
}
