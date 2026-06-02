/**
 * @module List Reconciliation
 *
 * Responsibility:
 * Implements the core reconciliation algorithm to determine minimal DOM changes
 * between list states.
 *
 * Design Intent:
 * Employs a multi-pass O(N) diffing strategy (Fast-Forward Head/Tail) to
 * generate an atomic mutation plan while minimizing memory pressure.
 */

import { shallowEqual } from '@but212/atom-effect-utils';
import { SYSTEM_LIST } from '@/constants';
import type { ListKey, ListKeyFn, ListOptions } from '@/types';
import { debug } from '@/utils/debug';
import type { ListSnapshot } from './context';
import { type DiffSlot, ItemState, type PreparedDiff } from './types';

/**
 * Generates a reconciliation plan between the previous and next state of a list.
 *
 * When to use:
 * - Internal orchestration of DOM mutations for the `atomList` binding.
 *
 * Optimization: Multi-pass O(N)
 * Uses head/tail fast-forward passes to achieve O(1) performance for common
 * append/prepend operations.
 *
 * @param snapshots - Sequential snapshot of the previous render state.
 * @param removingKeys - Keys currently undergoing asynchronous exit animations.
 * @param oldIndexMap - Inverse lookup for O(1) index retrieval from a key.
 * @param items - The new data array from the source atom.
 *
 * @internal
 */
export function buildIndices<T>(
  snapshots: ListSnapshot<T>[],
  removingKeys: Set<ListKey>,
  oldIndexMap: Map<ListKey, number>,
  items: T[],
  itemCount: number,
  getKey: ListKeyFn<T>,
  update: ListOptions<T>['update'],
  isEqual: ListOptions<T>['isEqual']
): PreparedDiff<T> {
  const oldLen = snapshots.length;
  const newIndexMap = new Map<ListKey, number>();
  const eq = isEqual || shallowEqual;

  let startIndex = 0;
  let oldEndIndex = oldLen - 1;
  let newEndIndex = itemCount - 1;

  const slots: DiffSlot<T>[] = new Array(itemCount);
  const toRender: DiffSlot<T>[] = [];

  // Logic: PASS 1 — Head Fast-Forward
  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex];
    if (item === undefined) break;
    const k = getKey(item, startIndex);
    const oldRow = snapshots[startIndex];
    if (!oldRow || oldRow.key !== k || !oldRow.node || !eq(oldRow.item, item)) break;

    slots[startIndex] = {
      key: k,
      item,
      state: ItemState.Unchanged,
      oldIndex: startIndex,
      targetIndex: startIndex,
      node: oldRow.node,
    };
    newIndexMap.set(k, startIndex++);
  }

  // Logic: PASS 2 — Tail Fast-Forward
  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex];
    if (item === undefined) break;
    const k = getKey(item, newEndIndex);
    const oldRow = snapshots[oldEndIndex];
    if (!oldRow || oldRow.key !== k || !oldRow.node || !eq(oldRow.item, item)) break;

    slots[newEndIndex] = {
      key: k,
      item,
      state: ItemState.Unchanged,
      oldIndex: oldEndIndex,
      targetIndex: newEndIndex,
      node: oldRow.node,
    };
    newIndexMap.set(k, newEndIndex--);
    oldEndIndex--;
  }

  // Logic: PASS 3 — Middle-Range Reconciliation
  const hasRemoving = removingKeys.size > 0;
  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i];
    if (item === undefined) continue;
    const k = getKey(item, i);

    if (newIndexMap.has(k)) {
      debug.warn(SYSTEM_LIST.PREFIX, SYSTEM_LIST.ERRORS.DUPLICATE_KEY(k, i));
      slots[i] = {
        key: k,
        item,
        state: ItemState.New,
        oldIndex: -1,
        targetIndex: i,
        node: undefined,
      };
      continue;
    }

    newIndexMap.set(k, i);

    const foundIdx = oldIndexMap.get(k);
    const oldIdx = foundIdx !== undefined && (!hasRemoving || !removingKeys.has(k)) ? foundIdx : -1;

    if (oldIdx === -1) {
      const slot: DiffSlot<T> = {
        key: k,
        item,
        state: ItemState.New,
        oldIndex: -1,
        targetIndex: i,
        node: undefined,
      };
      slots[i] = slot;
      toRender.push(slot);
    } else {
      const oldRow = snapshots[oldIdx];
      if (!oldRow) continue;
      const needsForceReplace = !update && !eq(oldRow.item, item);
      const slot: DiffSlot<T> = {
        key: k,
        item,
        state: needsForceReplace ? ItemState.ForceReplace : ItemState.Existing,
        oldIndex: oldIdx,
        targetIndex: i,
        node: oldRow.node,
      };
      slots[i] = slot;
      if (needsForceReplace) toRender.push(slot);
    }
  }

  return { slots, toRender, keyToIndex: newIndexMap };
}
