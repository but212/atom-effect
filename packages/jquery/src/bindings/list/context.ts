/**
 * @module List Context
 *
 * Responsibility:
 * Manages the persistent state and lifecycle of a reactive list binding.
 *
 * Design Intent:
 * Tracks historical DOM snapshots and handles asynchronous removal transitions
 * (exit animations) to maintain visual stability and prevent memory leaks.
 */

import type { EffectObject } from '@but212/atom-effect';
import $ from 'jquery';
import type { ListKey } from '@/types';
import { cleanupNodes, setAtomKey } from './utils';

/**
 * Represents the state of a single list item at a point in time.
 * Used by the reconciler to calculate moves, updates, and removals.
 */
export interface ListSnapshot<T> {
  key: ListKey;
  item: T;
  /** The actual raw DOM nodes representing this item. */
  node?: Node[] | undefined;
}

/**
 * Role: Persistent List State Interface (Plain Object)
 *
 * Reason:
 * Reactive lists require a stable reference to track historical DOM nodes across
 * multiple rendering cycles to support moves and patches.
 *
 * @internal
 */
export interface ListContext<T> {
  /** Sequential snapshot of the previous render state. */
  snapshots: ListSnapshot<T>[];
  /** Keys currently undergoing asynchronous exit animations. */
  readonly removingKeys: Set<ListKey>;
  /** Inverse lookup for O(1) index retrieval from a key. */
  keyToIndex: Map<ListKey, number>;
  /** Cached reference to the placeholder element shown when the list is empty. */
  $emptyEl: JQuery | null;
  /** The reactive effect controlling this list. Needed to check disposal state during async tasks. */
  fx: EffectObject | undefined;
  /** Target container element. */
  readonly $container: JQuery;
  /** Optional removal lifecycle hook. */
  readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined;
}

/**
 * Factory to create a ListContext instance.
 */
export function createListContext<T>(
  $container: JQuery,
  onRemove: (($el: JQuery) => Promise<void> | void) | undefined
): ListContext<T> {
  return {
    snapshots: [],
    removingKeys: new Set<ListKey>(),
    keyToIndex: new Map<ListKey, number>(),
    $emptyEl: null,
    fx: undefined,
    $container,
    onRemove,
  };
}

/**
 * Retrieves the index of a key, handling string-to-number normalization.
 */
export function getIndex<T>(ctx: ListContext<T>, key: string): number | undefined {
  const idx = ctx.keyToIndex.get(key as ListKey);
  if (idx !== undefined) return idx;
  const n = Number(key);
  return Number.isNaN(n) ? undefined : ctx.keyToIndex.get(n);
}

/**
 * Marks a key as "in transit" and starts the removal lifecycle.
 */
export function removeNode<T>(ctx: ListContext<T>, k: ListKey, nodes: Node[]): void {
  setAtomKey(nodes, null);
  ctx.removingKeys.add(k);
  scheduleRemoval(ctx, k, nodes);
}

/**
 * Initiates the physical removal of an element.
 */
export function scheduleRemoval<T>(ctx: ListContext<T>, k: ListKey, nodes: Node[]): void {
  const $el = $(nodes as HTMLElement[]);
  const res = ctx.onRemove?.($el);

  if (res instanceof Promise) {
    const commit = () => commitRemoval(ctx, k, nodes);
    res.then(commit, commit);
  } else {
    commitRemoval(ctx, k, nodes);
  }
}

/**
 * Finalizes DOM removal and state cleanup.
 */
export function commitRemoval<T>(ctx: ListContext<T>, k: ListKey, nodes: Node[]): void {
  if (ctx.fx?.isDisposed) return;

  const first = nodes[0];
  // Check if the element was re-bound to the list while we were waiting.
  if (first instanceof Element && first.hasAttribute('data-atom-key')) return;

  cleanupNodes(nodes);

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el?.isConnected && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
  ctx.removingKeys.delete(k);
}

/**
 * Resolves the nearest active list item's DOM element, its index, and the corresponding item
 * from a starting element, searching up to the container limit.
 */
export function resolveEventTarget<T>(
  ctx: ListContext<T>,
  start: Element,
  container: Element
): { target: HTMLElement; index: number; item: T } | null {
  let current: Element | null = start;
  while (current && current !== container) {
    const rawKey = current.getAttribute('data-atom-key');
    if (rawKey !== null) {
      const index = getIndex(ctx, rawKey);
      if (index !== undefined) {
        const snapshot = ctx.snapshots[index];
        if (snapshot) {
          return { target: current as HTMLElement, index, item: snapshot.item };
        }
      }
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Full cleanup of state and DOM references.
 */
export function disposeContext<T>(ctx: ListContext<T>): void {
  ctx.removingKeys.clear();
  ctx.snapshots = [];
  ctx.keyToIndex.clear();
  ctx.$emptyEl?.remove();
  ctx.$emptyEl = null;
  ctx.$container.off('.atomList');
}
