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
  atom,
  BRAND,
  BrandFlags,
  type EffectObject,
  isAtom,
  isWritable,
} from '@but212/atom-effect';
import $ from 'jquery';
import { getOrCreateRootObserver } from '@/core/observer';
import type { AtomComponentController, WritableAtom } from '@/types';

export interface ProviderEntry {
  value: unknown;
  effect?: EffectObject;
}

export interface NodeInternalState {
  providers?: Map<string | symbol, ProviderEntry>;
  injects?: Map<string | symbol, WritableAtom<unknown>>;
  controller?: AtomComponentController;
}

export interface DebugPortal {
  nodeStateMap: WeakMap<Node, NodeInternalState>;
  sheetCache: Map<string, CSSStyleSheet>;
  version: string;
}

declare global {
  interface Window {
    __AEJ_INTERNAL__?: DebugPortal;
  }
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
  let currentNode: Node | null = target;
  while (currentNode) {
    const state = nodeStateMap.get(currentNode);
    const provider = state?.providers?.get(key);
    if (provider) {
      return provider.value;
    }
    currentNode = currentNode instanceof ShadowRoot ? currentNode.host : currentNode.parentNode;
  }
  return undefined;
};

/**
 * Logic: Reactive Context Proxy
 * Creates a reactive proxy that resolves its target provider synchronously
 * on every access.
 *
 * Design Intent:
 * Uses one shared context revision for provider and DOM topology changes.
 * The provider is still resolved synchronously on every access, while the
 * revision gives subscriptions a deterministic invalidation source.
 *
 * @internal
 */
const contextRevision = atom(0, { sync: true });

export function invalidateContext(): void {
  contextRevision.value++;
}

export function setProvider(
  node: Node,
  key: string | symbol,
  value: unknown,
  effect?: EffectObject
): void {
  const state = getInternalState(node);
  state.providers?.get(key)?.effect?.dispose();
  state.providers ??= new Map();
  state.providers.set(key, effect ? { value, effect } : { value });
  invalidateContext();
}

export function disposeProviders(node: Node): void {
  const state = nodeStateMap.get(node);
  for (const provider of state?.providers?.values() ?? []) {
    provider.effect?.dispose();
  }
  state?.providers?.clear();
  invalidateContext();
}

function observeContext(target: HTMLElement): () => void {
  const subscriptions = new Map<Node, () => void>();
  const refresh = () => {
    const roots = new Set<Node>([target.ownerDocument, target.getRootNode()]);
    for (const [root, unsubscribe] of subscriptions) {
      if (!roots.has(root)) {
        unsubscribe();
        subscriptions.delete(root);
      }
    }
    for (const root of roots) {
      if (subscriptions.has(root)) continue;
      subscriptions.set(
        root,
        getOrCreateRootObserver(root).onStructureChanged(() => {
          // Rebind after topology changes so detached and reattached targets keep tracking context.
          invalidateContext();
          refresh();
        })
      );
    }
  };

  refresh();
  return () => {
    for (const unsubscribe of subscriptions.values()) unsubscribe();
    subscriptions.clear();
  };
}

function resolveContext<T>(target: HTMLElement, key: string | symbol, isPeek: boolean): T | null {
  const provider = discoverProvider(target, key);
  if (provider === undefined) return null;
  return (isAtom(provider) ? (isPeek ? provider.peek() : provider.value) : provider) as T;
}

type ContextSubscriber<T> = Parameters<WritableAtom<T>['subscribe']>[0];

function subscribeToContext<T>(
  target: HTMLElement,
  key: string | symbol,
  callback: ContextSubscriber<T | null>
): () => void {
  const sharedComputed = $.computed(() => {
    contextRevision.value;
    return resolveContext(target, key, false);
  });
  sharedComputed.value;
  const unsubscribeComputed = sharedComputed.subscribe(() => {
    sharedComputed.value;
    if (typeof callback === 'function') callback();
    else callback.execute();
  });
  const stopObserving = observeContext(target);
  let active = true;

  return () => {
    if (!active) return;
    active = false;
    unsubscribeComputed();
    stopObserving();
    sharedComputed.dispose();
  };
}

export function createContextProxy<T>(
  target: HTMLElement,
  key: string | symbol
): WritableAtom<T | null> {
  const subscriptions = new Set<() => void>();

  return {
    get value() {
      return resolveContext(target, key, false);
    },
    set value(newValue: T | null) {
      const provider = discoverProvider(target, key);
      if (provider !== undefined && isWritable(provider)) {
        provider.value = newValue;
      }
    },
    peek() {
      return resolveContext(target, key, true);
    },
    subscribe(callback) {
      const unsubscribeContext = subscribeToContext(target, key, callback);
      const cleanup = () => {
        if (!subscriptions.delete(cleanup)) return;
        unsubscribeContext();
      };
      subscriptions.add(cleanup);
      return cleanup;
    },
    subscriberCount: () => subscriptions.size,
    dispose() {
      for (const cleanup of [...subscriptions]) cleanup();
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T | null>;
}

if (typeof window !== 'undefined') {
  window.__AEJ_INTERNAL__ = {
    nodeStateMap,
    sheetCache,
    version: '0.34.1',
  };
}
