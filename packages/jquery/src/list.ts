import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registry } from './registry';
import type { ListOptions, ReadonlyAtom } from './types';
import { getSelector } from './utils';

/**
 * Longest Increasing Subsequence (LIS)
 * Optimized for hardware: Uses Int32Array for memory locality and cache hits.
 * Time Complexity: O(N log N), Space Complexity: O(N) but contiguous.
 */
function getLIS(arr: Int32Array | number[]): Int32Array {
  const len = arr.length;
  if (len === 0) return new Int32Array(0);

  // predecessors: pointer to previous index in LIS for backtracking (N indices)
  const predecessors = new Int32Array(len);
  // result: indices of the currently found longest increasing subsequence
  const result = new Int32Array(len);
  let resultLen = 0;

  for (let i = 0; i < len; i++) {
    const val = arr[i]!;
    if (val === -1) continue;

    if (resultLen === 0 || arr[result[resultLen - 1]!]! < val) {
      predecessors[i] = resultLen > 0 ? result[resultLen - 1]! : -1;
      result[resultLen++] = i;
      continue;
    }

    // Binary search for insertion point
    let left = 0,
      right = resultLen - 1;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (arr[result[mid]!]! < val) left = mid + 1;
      else right = mid;
    }

    if (val < arr[result[left]!]!) {
      if (left > 0) predecessors[i] = result[left - 1]!;
      result[left] = i;
    }
  }

  // Backtracking to reconstruct the LIS in the correct order
  const lis = new Int32Array(resultLen);
  for (let i = resultLen - 1, v = result[resultLen - 1]!; i >= 0; i--) {
    lis[i] = v;
    v = predecessors[v]!;
  }

  return lis;
}

/**
 * atomList with Smart Reconciliation
 * Optimized for performance and data locality.
 */
$.fn.atomList = function <T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  const { key, render, bind, update, onAdd, onRemove, empty } = options;

  // Resolve getKey once to avoid repeated typeof checks in the Hot Path
  const getKey =
    typeof key === 'function'
      ? key
      : (item: T) => item[key as keyof T] as unknown as string | number;

  return this.each(function () {
    const $container = $(this);
    const containerSelector = getSelector(this);

    const itemMap = new Map<string | number, { $el: JQuery; item: T }>();
    const removingKeys = new Set<string | number>();
    let oldKeys: (string | number)[] = [];
    let $emptyEl: JQuery | null = null;

    const fx = effect(() => {
      const items = source.value;
      const itemCount = items.length;

      // 1. Handle Empty Template Logic
      if (itemCount === 0) {
        if (empty && !$emptyEl) {
          $emptyEl = $(empty).appendTo($container);
        }
      } else if ($emptyEl) {
        $emptyEl.remove();
        $emptyEl = null;
      }

      // Hot Path: If both new and old are empty, skip processing
      if (itemCount === 0 && itemMap.size === 0) {
        oldKeys = [];
        return;
      }

      debug.log('list', `${containerSelector} updating with ${itemCount} items`);

      // 2. Prepare keys and identify removals (O(N) with cache-friendly loop)
      const newKeys: (string | number)[] = new Array(itemCount);
      const newKeySet = new Set<string | number>();

      for (let i = 0; i < itemCount; i++) {
        const item = items[i] as T; // Type assertion for generic T
        const k = getKey(item, i);
        newKeys[i] = k;
        newKeySet.add(k);
      }

      // 3. Remove vanished items (O(M)) - Respects onRemove callback
      for (const [k, entry] of itemMap) {
        if (newKeySet.has(k) || removingKeys.has(k)) continue;

        const cleanupItem = () => {
          entry.$el.remove();
          const el = entry.$el[0];
          if (el) registry.cleanup(el);
          removingKeys.delete(k);
          debug.log('list', `${containerSelector} removed item:`, k);
        };

        itemMap.delete(k);
        removingKeys.add(k);

        if (onRemove) {
          const result = onRemove(entry.$el);
          if (result instanceof Promise) result.then(cleanupItem);
          else cleanupItem();
        } else {
          cleanupItem();
        }
      }

      // If we adjusted from non-empty to empty, we can stop here after removal
      if (itemCount === 0) {
        oldKeys = [];
        return;
      }

      // 4. LIS Reconciliation (O(N log N))
      // Map keys to their OLD index for LIS input
      const oldIndexMap = new Map<string | number, number>();
      for (let i = 0; i < oldKeys.length; i++) {
        const k = oldKeys[i];
        if (k !== undefined) oldIndexMap.set(k, i);
      }

      // Input for LIS: where each new item came from in the old list
      const newIndices = new Int32Array(itemCount);
      for (let i = 0; i < itemCount; i++) {
        const k = newKeys[i];
        newIndices[i] = k !== undefined ? (oldIndexMap.get(k) ?? -1) : -1;
      }

      const lisArr = getLIS(newIndices);
      let lisIdx = lisArr.length - 1;

      // 5. Update and Reorder (Backwards iteration for insertBefore efficiency)
      let nextNode: Node | null = null;
      for (let i = itemCount - 1; i >= 0; i--) {
        const k = newKeys[i]!;
        const item = items[i]!;
        const entry = itemMap.get(k);

        if (entry) {
          // Existing Item: Update then potentially MOVE
          entry.item = item;
          const el = entry.$el[0];
          if (!el) continue;

          if (update) update(entry.$el, item, i);

          const isStable = lisIdx >= 0 && lisArr[lisIdx] === i;
          if (isStable) {
            lisIdx--;
            // Even if stable in LIS, check if the relative order with nextNode is correct
            const currentNext = el.nextSibling;
            if (currentNext !== nextNode) {
              if (nextNode) entry.$el.insertBefore(nextNode);
              else entry.$el.appendTo($container);
            }
          } else if (nextNode) {
            entry.$el.insertBefore(nextNode);
          } else {
            entry.$el.appendTo($container);
          }
          nextNode = el;
        } else {
          // New Item: Render and INSERT
          const rendered = render(item, i);
          const $el: JQuery = (
            rendered instanceof Element ? $(rendered) : $(rendered as string)
          ) as JQuery;
          itemMap.set(k, { $el, item });

          if (nextNode) $el.insertBefore(nextNode);
          else $el.appendTo($container);

          if (bind) bind($el, item, i);
          if (onAdd) onAdd($el);

          debug.log('list', `${containerSelector} added item:`, k);
          nextNode = $el[0] || null;
        }
      }

      oldKeys = newKeys;
    });

    registry.trackEffect(this, fx);
    registry.trackCleanup(this, () => {
      itemMap.clear();
      removingKeys.clear();
      oldKeys = [];
      $emptyEl?.remove();
    });
  });
};
