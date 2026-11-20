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
  node: Node[];
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
  /** Pending exit animations keyed by the rendered node group, not the item key. */
  readonly removingNodes: Set<Node[]>;
  /** Inverse lookup for O(1) index retrieval from a key. */
  keyToIndex: Map<ListKey, number>;
  /** Cached reference to the placeholder element shown when the list is empty. */
  $emptyElement: JQuery<Element> | null;
  /** The reactive effect controlling this list. Needed to check disposal state during async tasks. */
  reactiveEffect: EffectObject | undefined;
  /** Target container element. */
  readonly $container: JQuery;
  /** Optional removal lifecycle hook. */
  readonly onRemove: (($element: JQuery) => Promise<void> | void) | undefined;
}

/**
 * Factory to create a ListContext instance.
 */
export function createListContext<T>(
  $container: JQuery,
  onRemove: (($element: JQuery) => Promise<void> | void) | undefined
): ListContext<T> {
  return {
    snapshots: [],
    removingNodes: new Set<Node[]>(),
    keyToIndex: new Map<ListKey, number>(),
    $emptyElement: null,
    reactiveEffect: undefined,
    $container,
    onRemove,
  };
}

/**
 * Retrieves the index of a key, handling string-to-number normalization.
 */
function getIndex<T>(listContext: ListContext<T>, key: string): number | undefined {
  const index = listContext.keyToIndex.get(key);
  if (index !== undefined) return index;
  const numericKey = Number(key);
  return Number.isNaN(numericKey) ? undefined : listContext.keyToIndex.get(numericKey);
}

/**
 * Marks an item's nodes as "in transit" and starts the removal lifecycle.
 */
export function removeNode<T>(listContext: ListContext<T>, nodes: Node[]): void {
  setAtomKey(nodes, null);
  listContext.removingNodes.add(nodes);
  const $element = $(nodes as HTMLElement[]);
  const removalResult = listContext.onRemove?.($element);

  if (removalResult instanceof Promise) {
    const commit = () => commitRemoval(listContext, nodes);
    removalResult.then(commit, commit);
  } else {
    commitRemoval(listContext, nodes);
  }
}

/**
 * Finalizes DOM removal and state cleanup.
 */
export function commitRemoval<T>(listContext: ListContext<T>, nodes: Node[]): void {
  try {
    if (listContext.reactiveEffect?.isDisposed) return;

    // Re-bind backstop: if any of these exact nodes was re-bound live while the
    // async removal was pending (re-carrying data-atom-key), do NOT tear it down.
    for (let i = 0; i < nodes.length; i++) {
      const element = nodes[i];
      if (element instanceof Element && element.hasAttribute('data-atom-key')) return;
    }

    cleanupNodes(nodes);

    const container = listContext.$container[0];
    for (const node of nodes) {
      const parent = node.parentNode;
      // A list still owns its children while detached from the document.
      if (parent && (parent === container || node.isConnected)) parent.removeChild(node);
    }
  } finally {
    listContext.removingNodes.delete(nodes);
  }
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
  listContext.reactiveEffect?.dispose();

  const nodes = new Set<Node[]>();
  for (const snapshot of listContext.snapshots) {
    if (snapshot.node) nodes.add(snapshot.node);
  }
  for (const pending of listContext.removingNodes) nodes.add(pending);

  for (const itemNodes of nodes) {
    cleanupNodes(itemNodes);
    for (const node of itemNodes) {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }

  listContext.removingNodes.clear();
  listContext.snapshots = [];
  listContext.keyToIndex.clear();
  listContext.$emptyElement?.remove();
  listContext.$emptyElement = null;
  listContext.$container.off('.atomList');
}
