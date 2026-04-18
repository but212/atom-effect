import type { ListKey, ListKeyFn, ListOptions } from '@/types';

export type { ListKey, ListKeyFn };

export const ItemState = {
  Unchanged: 0,

  Existing: 1 << 0,

  New: 1 << 1,

  ForceReplace: 1 << 2,
} as const;

export type ItemState = (typeof ItemState)[keyof typeof ItemState];

export interface PreparedDiff<T> {
  newKeys: ListKey[];
  newItems: T[];
  newKeySet: Set<ListKey>;
  newIndices: number[];
  newStates: ItemState[];
  newNodes: (Element | JQuery | undefined)[];

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
