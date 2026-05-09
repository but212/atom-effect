import { shallowEqual } from '@but212/atom-effect-utils';
import { SYSTEM_LIST } from '@/constants';
import type { ListKey, ListKeyFn, ListOptions } from '@/types';
import { debug } from '@/utils/debug';
import type { ListContext } from './context';
import { ItemState, type PreparedDiff } from './types';

/**
 * Generates a reconciliation plan by calculating the difference between the
 * current list state and the new item set.
 *
 * Logic: This function implements a double-ended diffing algorithm to identify
 * reusable DOM nodes, new entries, and required replacements. It optimizes
 * performance by isolating the "dirty" range — skipping unchanged items at
 * both the head and tail of the list.
 *
 * When to use:
 * - Internal orchestration of DOM mutations for the `atomList` binding.
 *
 * @param ctx - The current list context containing historical DOM state.
 * @param items - The new set of items to render.
 * @param itemCount - The total number of new items.
 * @param getKey - A function to derive a unique key for each item.
 * @param update - An optional callback used to patch existing DOM nodes.
 * @param isEqual - An optional equality comparator for items.
 * @returns A detailed diff plan used to execute DOM updates.
 *
 * @example
 * ```typescript
 * const diff = buildIndices(context, nextItems, nextItems.length, getKey, onUpdate, onEqual);
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

  let startIndex = 0;
  let oldEndIndex = oldLen - 1;
  let newEndIndex = itemCount - 1;

  const newKeySet = new Set<ListKey>();
  const newKeys: ListKey[] = new Array(itemCount);
  const newItems: T[] = new Array(itemCount);
  const newNodes: (Element | JQuery | undefined)[] = new Array(itemCount);
  const newStates: ItemState[] = new Array(itemCount);
  const newIndices: number[] = new Array(itemCount);
  const toRender: { key: ListKey; item: T; index: number }[] = [];

  // Optimization: Fast-forward through identical items at the start of the list.
  // This bypasses the mapping and diffing logic for static sections of the list.
  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex]!;
    const k = getKey(item, startIndex);
    if (oldKeys[startIndex] !== k || !eq(oldItems[startIndex]!, item) || !oldNodes[startIndex]) {
      break;
    }
    keyToIndex.set(k, startIndex++);
  }

  // Optimization: Fast-forward through identical items at the end of the list.
  // Narrowing the "dirty" middle range minimizes the complexity of the O(N) mapping phase.
  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex]!;
    const k = getKey(item, newEndIndex);
    if (oldKeys[oldEndIndex] !== k || !eq(oldItems[oldEndIndex]!, item) || !oldNodes[oldEndIndex]) {
      break;
    }
    keyToIndex.set(k, newEndIndex--);
    oldEndIndex--;
  }

  // Logic: Re-populate unchanged head items into the new state buffers.
  for (let i = 0; i < startIndex; i++) {
    const k = oldKeys[i]!;
    newKeys[i] = k;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[i]!;
    newStates[i] = ItemState.Unchanged;
    newIndices[i] = i;
    newKeySet.add(k);
  }

  // Logic: Re-populate unchanged tail items into the new state buffers.
  for (let j = oldLen - 1, i = itemCount - 1; i > newEndIndex; i--, j--) {
    const k = oldKeys[j]!;
    newKeys[i] = k;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[j]!;
    newStates[i] = ItemState.Unchanged;
    newIndices[i] = j;
    newKeySet.add(k);
  }

  const oldIndexMap = new Map<ListKey, number>();
  for (let i = startIndex; i <= oldEndIndex; i++) {
    oldIndexMap.set(oldKeys[i]!, i);
  }

  // Logic: Reconcile the remaining "dirty" middle section of the list.
  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i]!;
    const k = getKey(item, i);
    newKeys[i] = k;
    newItems[i] = item;
    keyToIndex.set(k, i);

    if (newKeySet.has(k)) {
      debug.warn(SYSTEM_LIST.PREFIX, SYSTEM_LIST.ERRORS.DUPLICATE_KEY(k, i));
      newIndices[i] = -1;
      continue;
    }
    newKeySet.add(k);

    const foundIdx = oldIndexMap.get(k);

    // Caution: Reclaiming animating nodes.
    // If a key is present in `removingKeys`, its DOM node is currently undergoing
    // a removal transition. To prevent inconsistent UI states, we treat this
    // as a 'New' item (forcing a fresh node creation) rather than attempting
    // to reclaim the transitioning node.
    const oldIdx = foundIdx !== undefined && !removingKeys.has(k) ? foundIdx : undefined;

    if (oldIdx === undefined) {
      toRender.push({ key: k, item, index: i });
      newIndices[i] = -1;
      newStates[i] = ItemState.New;
      continue;
    }

    newNodes[i] = oldNodes[oldIdx]!;

    // Logic: Node reuse strategy.
    // If no custom `update` callback is provided and the item content has changed,
    // the existing DOM node cannot be patched. In this case, we trigger a
    // 'ForceReplace' state to ensure the node is fully re-rendered.
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
