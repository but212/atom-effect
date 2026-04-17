/**
 * @module
 * Defines types and state constants used for list binding.
 */
import type { ListKey, ListKeyFn, ListOptions } from '@/types';

export type { ListKey, ListKeyFn };

/**
 * Represents the change state of a list item.
 * Multiple states can be combined using bitwise flags.
 */
export const ItemState = {
  /** The position and data remain unchanged. */
  Unchanged: 0,
  /** An existing item (may be subject to updates). */
  Existing: 1 << 0,
  /** A newly added item. */
  New: 1 << 1,
  /** Data has changed, requiring a forced re-render. */
  ForceReplace: 1 << 2,
} as const;

export type ItemState = (typeof ItemState)[keyof typeof ItemState];

/**
 * The output of a list diff calculation.
 * Contains all necessary information for DOM manipulation (insertion, move, removal).
 */
export interface PreparedDiff<T> {
  newKeys: ListKey[];
  newItems: T[];
  newKeySet: Set<ListKey>;
  newIndices: number[];
  newStates: ItemState[];
  newNodes: (Element | JQuery | undefined)[];
  /** List of items that require actual rendering (HTML generation). */
  toRender: { key: ListKey; item: T; index: number }[];
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
}

export interface PlaceCallbacks<T> {
  bind?: (($el: JQuery, item: T, index: number) => void) | undefined;
  update?: (($el: JQuery, item: T, index: number) => void) | undefined;
  onAdd?: (($el: JQuery) => void) | undefined;
  onRemove?: ListOptions<T>['onRemove'] | undefined;
  events?: ListOptions<T>['events'] | undefined;
}
