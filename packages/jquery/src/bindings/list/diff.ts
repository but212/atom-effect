import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { ListKey, ListKeyFn, ListOptions } from '@/types';
import { shallowEqual } from '@/utils';
import { debug } from '@/utils/debug';
import type { ListContext } from './context';
import { ItemState, type PreparedDiff } from './types';

/**
 * Prepares the reconciliation plan (diff) between the old list state and the new items.
 *
 * This function identifies which DOM nodes can be reused, which are new,
 * and which need a forced replacement based on key/identity changes.
 *
 * Performance: Uses a double-ended diffing strategy (prefix/suffix matching)
 * to skip unchanged elements at both ends, isolating only the modified middle section.
 */
export function buildIndices<T>(
  ctx: ListContext<T>,
  items: T[],
  itemCount: number,
  getKey: ListKeyFn<T>,
  update: ListOptions<T>['update'],
  isEqual: ListOptions<T>['isEqual']
): PreparedDiff<T> {
  const { oldKeys, oldItems, oldNodes, removingKeys, keyToIndex } = ctx;
  const oldLen = oldKeys.length;
  const eq = isEqual || shallowEqual;

  let startIndex = 0,
    oldEndIndex = oldLen - 1,
    newEndIndex = itemCount - 1;

  const newKeySet = new Set<ListKey>();
  const newKeys: ListKey[] = new Array(itemCount);
  const newItems: T[] = new Array(itemCount);
  const newNodes: (Element | JQuery | undefined)[] = new Array(itemCount);
  const newStates: ItemState[] = new Array(itemCount);
  const newIndices: number[] = new Array(itemCount);
  const toRender: { key: ListKey; item: T; index: number }[] = [];

  // Optimization Step 1: Skip unchanged prefix
  // Reason: Fast-forward through items that haven't moved or changed at the start.
  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex]!,
      k = getKey(item, startIndex);
    if (oldKeys[startIndex] !== k || !eq(oldItems[startIndex]!, item) || !oldNodes[startIndex])
      break;
    keyToIndex.set(k, startIndex++);
  }

  // Optimization Step 2: Skip unchanged suffix
  // Reason: Isolate the "dirty" middle range by matching unchanged items from the end.
  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex]!,
      k = getKey(item, newEndIndex);
    if (oldKeys[oldEndIndex] !== k || !eq(oldItems[oldEndIndex]!, item) || !oldNodes[oldEndIndex])
      break;
    keyToIndex.set(k, newEndIndex--);
    oldEndIndex--;
  }

  // Process skip ranges as Unchanged
  for (let i = 0; i < startIndex; i++) {
    const k = oldKeys[i]!;
    newKeys[i] = k;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[i]!;
    newStates[i] = ItemState.Unchanged;
    newIndices[i] = i;
    newKeySet.add(k);
  }
  for (let j = oldLen - 1, i = itemCount - 1; i > newEndIndex; i--, j--) {
    const k = oldKeys[j]!;
    newKeys[i] = k;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[j]!;
    newStates[i] = ItemState.Unchanged;
    newIndices[i] = j;
    newKeySet.add(k);
  }

  // Map remaining old keys for fast lookup during middle-section diffing
  const oldIndexMap = new Map<ListKey, number>();
  for (let i = startIndex; i <= oldEndIndex; i++) oldIndexMap.set(oldKeys[i]!, i);

  // Process the "dirty" middle section
  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i]!,
      k = getKey(item, i);
    newKeys[i] = k;
    newItems[i] = item;
    keyToIndex.set(k, i);

    if (newKeySet.has(k)) {
      debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.LIST.DUPLICATE_KEY(k, i));
      newIndices[i] = -1;
      continue;
    }
    newKeySet.add(k);

    const foundIdx = oldIndexMap.get(k);
    // Caution: If a key is in removingKeys, its DOM node is currently animating out.
    // We must treat it as a new item rather than re-using the decaying DOM node.
    const oldIdx = foundIdx !== undefined && !removingKeys.has(k) ? foundIdx : undefined;

    if (oldIdx === undefined) {
      toRender.push({ key: k, item, index: i });
      newIndices[i] = -1;
      newStates[i] = ItemState.New;
      continue;
    }

    newNodes[i] = oldNodes[oldIdx]!;
    // Logic: If 'update' is not provided and content changed, we can't patch the DOM.
    // We must force a full replacement (destroy and re-create).
    if (!update && !eq(oldItems[oldIdx]!, item)) {
      toRender.push({ key: k, item, index: i });
      newStates[i] = ItemState.ForceReplace;
    } else {
      newStates[i] = ItemState.Existing;
    }
    newIndices[i] = oldIdx;
  }

  return {
    newKeys,
    newKeySet,
    newItems,
    newNodes,
    newStates,
    newIndices,
    toRender,
    startIndex,
    oldEndIndex,
    newEndIndex,
  };
}
