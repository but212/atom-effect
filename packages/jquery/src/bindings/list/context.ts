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
  $emptyEl: JQuery<Element> | null;
  /** The reactive effect controlling this list. Needed to check disposal state during async tasks. */
  reactiveEffect: EffectObject | undefined;
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
    reactiveEffect: undefined,
    $container,
    onRemove,
  };
}

/**
 * Retrieves the index of a key, handling string-to-number normalization.
 */
export function getIndex<T>(listContext: ListContext<T>, key: string): number | undefined {
  const index = listContext.keyToIndex.get(key);
  if (index !== undefined) return index;
  const numericKey = Number(key);
  return Number.isNaN(numericKey) ? undefined : listContext.keyToIndex.get(numericKey);
}

/**
 * Marks a key as "in transit" and starts the removal lifecycle.
 */
export function removeNode<T>(listContext: ListContext<T>, itemKey: ListKey, nodes: Node[]): void {
  setAtomKey(nodes, null);
  listContext.removingKeys.add(itemKey);
  scheduleRemoval(listContext, itemKey, nodes);
}

/**
 * Initiates the physical removal of an element.
 */
export function scheduleRemoval<T>(
  listContext: ListContext<T>,
  itemKey: ListKey,
  nodes: Node[]
): void {
  const $element = $(nodes as HTMLElement[]);
  const removalResult = listContext.onRemove?.($element);

  if (removalResult instanceof Promise) {
    const commit = () => commitRemoval(listContext, itemKey, nodes);
    removalResult.then(commit, commit);
  } else {
    commitRemoval(listContext, itemKey, nodes);
  }
}

/**
 * Finalizes DOM removal and state cleanup.
 */
export function commitRemoval<T>(
  listContext: ListContext<T>,
  itemKey: ListKey,
  nodes: Node[]
): void {
  if (listContext.reactiveEffect?.isDisposed) return;

  const firstElement = nodes[0];
  // Check if the element was re-bound to the list while we were waiting.
  if (firstElement instanceof Element && firstElement.hasAttribute('data-atom-key')) return;

  cleanupNodes(nodes);

  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
    if (element?.isConnected && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
  listContext.removingKeys.delete(itemKey);
}

/**
 * Resolves the nearest active list item's DOM element, its index, and the corresponding item
 * from a starting element, searching up to the container limit.
 */
export function resolveEventTarget<T>(
  listContext: ListContext<T>,
  startingElement: Element,
  container: Element
): { target: Element; index: number; item: T } | null {
  let currentElement: Element | null = startingElement;
  while (currentElement && currentElement !== container) {
    const rawKey = currentElement.getAttribute('data-atom-key');
    if (rawKey !== null) {
      const index = getIndex(listContext, rawKey);
      if (index !== undefined) {
        const snapshot = listContext.snapshots[index];
        if (snapshot) {
          return { target: currentElement, index, item: snapshot.item };
        }
      }
    }
    currentElement = currentElement.parentElement;
  }
  return null;
}

/**
 * Full cleanup of state and DOM references.
 */
export function disposeContext<T>(listContext: ListContext<T>): void {
  listContext.removingKeys.clear();
  listContext.snapshots = [];
  listContext.keyToIndex.clear();
  listContext.$emptyEl?.remove();
  listContext.$emptyEl = null;
  listContext.$container.off('.atomList');
}
