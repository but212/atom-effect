import type { ListKey, ListKeyFn, ListOptions } from '@/types';

export type { ListKey, ListKeyFn };

export interface PreparedDiff<T> {
  newKeys: ListKey[];
  newKeySet: Set<ListKey>;
  newItems: T[];
  newNodes: (Element | JQuery | undefined)[];
  newStates: Uint8Array;
  newIndices: Int32Array;
  trKeys: ListKey[];
  trItems: T[];
  trIdxs: number[];
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
}

export interface PlaceCallbacks<T> {
  bind: ListOptions<T>['bind'];
  update: ListOptions<T>['update'];
  onAdd: ListOptions<T>['onAdd'];
  onRemove: ListOptions<T>['onRemove'];
  events: ListOptions<T>['events'];
}
