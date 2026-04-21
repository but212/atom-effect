import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { ListKey, ListKeyFn, ListOptions } from '@/types';
import { shallowEqual } from '@/utils';
import { debug } from '@/utils/debug';
import type { ListContext } from './context';
import { ItemState, type PreparedDiff } from './types';

/**
 * Prepares the reconciliation plan (diff) between the old list state and the new items.
 *
 * Logic: Identifies reusable DOM nodes, new entries, and forced replacements
 * using a high-performance double-ended diffing algorithm. It isolates the
 * modified "dirty" range by skipping unchanged items at both ends of the list.
 *
 * When to use:
 * - Calculating a batch of DOM mutations for the `atomList` binding.
 *
 * @example
 * ```typescript
 * const diff = buildIndices(ctx, items, items.length, getKey, updateFn, eqFn);
 * ```
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

  // Optimization: 1. Skip unchanged prefix.
  // Reason: Fast-forward through items that haven't moved or changed at the start
  // to avoid mapping overhead for static sections.
  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex]!,
      k = getKey(item, startIndex);
    if (oldKeys[startIndex] !== k || !eq(oldItems[startIndex]!, item) || !oldNodes[startIndex])
      break;
    keyToIndex.set(k, startIndex++);
  }

  // Optimization: 2. Skip unchanged suffix.
  // Reason: Narrow the "dirty" middle range by matching items from the end,
  // minimizing the O(N) complexity of the subsequent mapping phase.
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
    // Caution: Reclaiming an animating node.
    // If a key is in `removingKeys`, its DOM node is currently performing a
    // removal animation. We must treat this as a 'New' item (creating a fresh node)
    // rather than potentially re-using a node that is in an inconsistent state.
    const oldIdx = foundIdx !== undefined && !removingKeys.has(k) ? foundIdx : undefined;

    if (oldIdx === undefined) {
      toRender.push({ key: k, item, index: i });
      newIndices[i] = -1;
      newStates[i] = ItemState.New;
      continue;
    }

    newNodes[i] = oldNodes[oldIdx]!;

    // Logic: Handling partial updates vs full replacements.
    // If an 'update' callback is missing and content has changed, the library
    // cannot patch the existing DOM. We must force a 'ForceReplace' state
    // to trigger a clean re-render.
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
