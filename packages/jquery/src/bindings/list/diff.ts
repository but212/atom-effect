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
import type { ListContext } from './context';
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
 * @param ctx - Persistent state containing historical DOM and keys.
 * @param items - The new data array from the source atom.
 *
 * @internal
 */
export function buildIndices<T>(
  ctx: ListContext<T>,
  items: T[],
  itemCount: number,
  getKey: ListKeyFn<T>,
  update: ListOptions<T>['update'],
  isEqual: ListOptions<T>['isEqual']
): PreparedDiff<T> {
  const { snapshots, removingKeys, keyToIndex: oldIndexMap } = ctx;
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
    const item = items[startIndex]!;
    const k = getKey(item, startIndex);
    const oldRow = snapshots[startIndex]!;
    const oldKey = oldRow.key;
    const oldNode = oldRow.node;

    if (oldKey !== k || !oldNode || !eq(oldRow.item, item)) {
      break;
    }

    slots[startIndex] = {
      key: k,
      item,
      state: ItemState.Unchanged,
      oldIndex: startIndex,
      targetIndex: startIndex,
      node: oldNode,
    };

    newIndexMap.set(k, startIndex);
    startIndex++;
  }

  // Logic: PASS 2 — Tail Fast-Forward
  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex]!;
    const k = getKey(item, newEndIndex);
    const oldRow = snapshots[oldEndIndex]!;
    const oldKey = oldRow.key;
    const oldNode = oldRow.node;

    if (oldKey !== k || !oldNode || !eq(oldRow.item, item)) {
      break;
    }

    slots[newEndIndex] = {
      key: k,
      item,
      state: ItemState.Unchanged,
      oldIndex: oldEndIndex,
      targetIndex: newEndIndex,
      node: oldNode,
    };

    newIndexMap.set(k, newEndIndex);
    oldEndIndex--;
    newEndIndex--;
  }

  // Logic: PASS 3 — Middle-Range Reconciliation
  const hasRemovingKeys = removingKeys.size > 0;

  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i]!;
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
    const oldIdx =
      foundIdx !== undefined && (!hasRemovingKeys || !removingKeys.has(k)) ? foundIdx : -1;

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
      continue;
    }

    const oldRow = snapshots[oldIdx]!;
    const needsForceReplace = !update && !eq(oldRow.item, item);
    const slot: DiffSlot<T> = {
      key: k,
      item,
      state: needsForceReplace ? ItemState.ForceReplace : ItemState.Existing,
      oldIndex: oldIdx,
      targetIndex: i,
      node: oldRow.node!,
    };

    slots[i] = slot;
    if (needsForceReplace) toRender.push(slot);
  }

  return { slots, toRender, keyToIndex: newIndexMap };
}
