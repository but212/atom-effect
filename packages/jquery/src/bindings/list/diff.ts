import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { ListKey, ListKeyFn, ListOptions } from '@/types';
import { shallowEqual } from '@/utils';
import { debug } from '@/utils/debug';
import type { ListContext } from './context';
import type { PreparedDiff } from './types';

export function buildIndices<T>(
  ctx: ListContext<T>,
  items: T[],
  itemCount: number,
  getKey: ListKeyFn<T>,
  update: ListOptions<T>['update'],
  isEqual: ListOptions<T>['isEqual'],
  pools: {
    map: { acquire: () => Map<ListKey, number>; release: (m: Map<ListKey, number>) => void };
    set: { acquire: () => Set<ListKey>; release: (s: Set<ListKey>) => void };
    array: { acquire: () => unknown[]; release: (a: unknown[]) => void };
  }
): PreparedDiff<T> {
  const { oldKeys, oldItems, oldNodes, removingKeys, keyToIndex } = ctx;
  const oldLen = oldKeys.length;

  let startIndex = 0,
    oldEndIndex = oldLen - 1,
    newEndIndex = itemCount - 1;

  const eq = isEqual || shallowEqual;

  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex]!;
    const k = getKey(item, startIndex);
    if (oldKeys[startIndex] !== k || !eq(oldItems[startIndex]!, item) || !oldNodes[startIndex]) {
      break;
    }
    keyToIndex.set(k, startIndex++);
  }

  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex]!;
    const k = getKey(item, newEndIndex);
    if (oldKeys[oldEndIndex] !== k || !eq(oldItems[oldEndIndex]!, item) || !oldNodes[oldEndIndex]) {
      break;
    }
    keyToIndex.set(k, newEndIndex--);
    oldEndIndex--;
  }

  const oldIndexMap = pools.map.acquire();
  for (let i = startIndex; i <= oldEndIndex; i++) oldIndexMap.set(oldKeys[i]!, i);

  const newKeySet = pools.set.acquire();
  ctx.ensureBuffers(itemCount);

  const newKeys = pools.array.acquire() as ListKey[];
  newKeys.length = itemCount;
  const newItems = pools.array.acquire() as T[];
  newItems.length = itemCount;
  const newNodes = pools.array.acquire() as (Element | JQuery | undefined)[];
  newNodes.length = itemCount;
  const newStates = ctx.statesBuffer,
    newIndices = ctx.indicesBuffer;

  const trKeys = pools.array.acquire() as ListKey[],
    trItems = pools.array.acquire() as T[],
    trIdxs = pools.array.acquire() as number[];

  for (let i = 0; i < startIndex; i++) {
    const k = oldKeys[i]!;
    newKeys[i] = k;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[i]!;
    newStates[i] = 3;
    newIndices[i] = i;
    newKeySet.add(k);
  }
  for (let j = oldLen - 1, i = itemCount - 1; i > newEndIndex; i--, j--) {
    const k = oldKeys[j]!;
    newKeys[i] = k;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[j]!;
    newStates[i] = 3;
    newIndices[i] = j;
    newKeySet.add(k);
  }

  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i]!,
      k = getKey(item, i);
    newKeys[i] = k;
    newItems[i] = item;
    keyToIndex.set(k, i);

    if (newKeySet.has(k)) {
      debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.LIST.DUPLICATE_KEY(k, i, ctx.containerSelector));
      newIndices[i] = -1;
      continue;
    }
    newKeySet.add(k);

    const oldIdx = oldIndexMap.get(k);
    if (oldIdx === undefined) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
      newIndices[i] = -1;
      newStates[i] = 1;
      continue;
    }

    const oldItem = oldItems[oldIdx]!;
    newNodes[i] = oldNodes[oldIdx]!;

    if (
      !update &&
      oldItem !== item &&
      !(isEqual ? isEqual(oldItem, item) : shallowEqual(oldItem, item))
    ) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
      newStates[i] = 2;
    } else {
      newStates[i] = 0;
    }
    newIndices[i] = removingKeys.has(k) ? -1 : oldIdx;
  }

  pools.map.release(oldIndexMap);
  return {
    newKeys,
    newKeySet,
    newItems,
    newNodes,
    newStates,
    newIndices,
    trKeys,
    trItems,
    trIdxs,
    startIndex,
    oldEndIndex,
    newEndIndex,
  };
}
