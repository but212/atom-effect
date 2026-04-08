import type { ListKey, ListKeyFn, ListOptions } from '@/types';

export type { ListKey, ListKeyFn };

/**
 * Internal representation of the reconciliation result.
 */
export interface PreparedDiff<T> {
  /** The new set of keys from the source items. */
  newKeys: ListKey[];
  /** Set of keys for fast lookup. */
  newKeySet: Set<ListKey>;
  /** The new items from the source. */
  newItems: T[];
  /**
   * Can be a Node (single root) or JQuery (multi-root).
   */
  newNodes: (Node | JQuery | undefined)[];
  /**
   * Status of each item in the new list.
   * 0: Existing (possibly update), 1: New (add), 2: Forced (replace), 3: Unchanged (trimmed)
   */
  newStates: Uint8Array;
  /**
   * Index in oldItems corresponding to this new item (-1 if new/forced).
   */
  newIndices: Int32Array;

  /** Keys that need creation or replacement. */
  trKeys: ListKey[];
  /** Items that need creation or replacement. */
  trItems: T[];
  /** Indices in the result array for creation/replacement. */
  trIdxs: number[];

  /** Index start of the non-trimmed middle section. */
  startIndex: number;
  /** Index end of the non-trimmed middle section in the old list. */
  oldEndIndex: number;
  /** Index end of the non-trimmed middle section in the new list. */
  newEndIndex: number;
}

/**
 * Internal structure for grouping lifecycle callbacks.
 */
export interface PlaceCallbacks<T> {
  bind: ListOptions<T>['bind'];
  update: ListOptions<T>['update'];
  onAdd: ListOptions<T>['onAdd'];
  onRemove: ListOptions<T>['onRemove'];
  events: ListOptions<T>['events'];
}
