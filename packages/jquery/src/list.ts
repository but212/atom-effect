import $ from 'jquery';
import { effect } from '@but212/atom-effect';
import { registry } from './registry';
import { debug } from './debug';
import { getSelector } from './utils';
import type { ListOptions, ReadonlyAtom } from './types';

/**
 * Helper: Longest Increasing Subsequence (LIS)
 * O(N log N) algorithm used to minimize DOM moves in the diffing algorithm.
 */
function getLIS(arr: number[]): number[] {
  if (arr.length === 0) return [];

  // predecessors: stores the index of the previous element for backtracking
  const predecessors = arr.slice();

  // result: stores the indices of the longest increasing subsequence found so far
  // result[k] is the index of the last element of an increasing subsequence of length k+1
  const result: number[] = [0];

  let i: number, left: number, right: number, mid: number;
  const len = arr.length;

  for (i = 0; i < len; i++) {
    const arrI = arr[i];

    // -1 is treated as "not present" or "ignored" (specific to the diff algorithm)
    if (arrI !== -1) {
      const lastResultIndex = result[result.length - 1];

      // Case A: If current value is greater than the last value in result -> append (Greedy)
      if (arr[lastResultIndex] < arrI) {
        predecessors[i] = lastResultIndex;
        result.push(i);
        continue;
      }

      // Case B: If current value is smaller or equal -> find the insertion point (Binary Search)
      // Updates with a smaller value to increase future possibilities without breaking the sequence
      left = 0;
      right = result.length - 1;

      while (left < right) {
        mid = ((left + right) / 2) | 0;
        if (arr[result[mid]] < arrI) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }

      // Replace if the current value is smaller than the value at the found position
      if (arrI < arr[result[left]]) {
        if (left > 0) {
          // Link the predecessor
          predecessors[i] = result[left - 1];
        }
        result[left] = i;
      }
    }
  }

  // Backtracking: reconstruct the actual LIS path using predecessors
  let u = result.length;
  let v = result[u - 1];

  while (u-- > 0) {
    result[u] = v;
    v = predecessors[v];
  }

  return result;
}

/**
 * Implementation of atomList with Smart Reconciliation (Keyed Diffing)
 * Uses LIS (Longest Increasing Subsequence) to minimize DOM moves.
 */
$.fn.atomList = function<T>(
  source: ReadonlyAtom<T[]>,
  options: ListOptions<T>
): JQuery {
  return this.each(function() {
    const $container = $(this);
    const containerSelector = getSelector(this);

    const { key, render, bind, onAdd, onRemove, empty } = options;

    const getKey = typeof key === 'function'
      ? key
      : (item: T) => item[key as keyof T] as unknown as string | number;

    const itemMap = new Map<string | number, { $el: JQuery; item: T }>();
    let oldKeys: (string | number)[] = [];
    let $emptyEl: JQuery | null = null;

    // Track keys currently being removed (async animation etc.)
    // This prevents duplicate items when the same key is re-added during removal
    const removingKeys = new Set<string | number>();

    const fx = effect(() => {
      const items = source.value;
      const newKeys: (string | number)[] = [];
      const newKeySet = new Set<string | number>();

      // 1. Prepare keys
      for (let i = 0; i < items.length; i++) {
        const k = getKey(items[i], i);
        newKeys.push(k);
        newKeySet.add(k);
      }

      debug.log('list', `${containerSelector} updating with ${items.length} items`);

      // 2. Handle Empty State
      if (items.length === 0 && empty) {
        if (!$emptyEl) {
          $emptyEl = $(empty);
          $container.append($emptyEl);
        }
        for (const [, entry] of itemMap) {
          entry.$el.remove();
          const el = entry.$el[0];
          if (el) registry.cleanup(el);
        }
        itemMap.clear();
        oldKeys = [];
        return;
      } else if ($emptyEl) {
        $emptyEl.remove();
        $emptyEl = null;
      }

      // 3. Remove vanished items
      for (const [k, entry] of itemMap) {
        if (!newKeySet.has(k)) {
          // Skip if already being removed (prevents duplicate removal attempts)
          if (removingKeys.has(k)) continue;

          const doRemove = () => {
             entry.$el.remove();
             const el = entry.$el[0];
             if (el) registry.cleanup(el);
             removingKeys.delete(k); // Clear from tracking when removal completes
             debug.log('list', `${containerSelector} removed item:`, k);
          };

          itemMap.delete(k); // Remove from map immediately to avoid interference
          removingKeys.add(k); // Mark as being removed
          
          if (onRemove) {
            Promise.resolve(onRemove(entry.$el)).then(doRemove);
          } else {
            doRemove();
          }
        }
      }

      // 4. LIS algorithm for minimizing moves
      // Map keys to their index in the OLD list
      const oldIndexMap = new Map<string|number, number>();
      oldKeys.forEach((k, i) => oldIndexMap.set(k, i));

      // Construct array of old indices for the new items
      const newIndices = newKeys.map(k => oldIndexMap.get(k) ?? -1);
      
      // Get indices of items in the new list that form the LIS (stable candidates)
      const lis = getLIS(newIndices);
      const lisSet = new Set(lis); // fast lookup

      // 5. Reconciliation (Backwards)
      let nextNode: Node | null = null;

      for (let i = items.length - 1; i >= 0; i--) {
        const key = newKeys[i];
        const item = items[i];
        const isStable = lisSet.has(i);

        if (itemMap.has(key)) {
          // Update Existing
          const entry = itemMap.get(key);
          if (!entry) continue; // Type guard
          
          entry.item = item;
          const el = entry.$el[0];
          if (!el) continue; // Type guard
            
          if (options.update) {
            options.update(entry.$el, item, i);
          }

          if (!isStable) {
            // MOVED (Not in LIS)
            if (nextNode) {
              entry.$el.insertBefore(nextNode);
            } else {
              entry.$el.appendTo($container);
            }
          } else {
            // STABLE (In LIS) - But check for gaps/interleaving
            // If the stable item isn't strictly before the next one, fix it.
            // (e.g., if a new item was inserted, or a neighbor moved away)
            const nextSib = el.nextSibling;
            if (nextNode && nextSib !== nextNode) {
              entry.$el.insertBefore(nextNode);
            } else if (!nextNode && nextSib) {
              entry.$el.appendTo($container);
            }
          }
          nextNode = el; // This node is now the anchor
        } else {
          const rendered = render(item, i);
          const $el: JQuery = (rendered instanceof Element ? $(rendered) : $(rendered as string)) as JQuery;
          itemMap.set(key, { $el, item });

          if (nextNode) {
             $el.insertBefore(nextNode);
          } else {
             $el.appendTo($container);
          }
          
          if (bind) bind($el, item, i);
          if (onAdd) onAdd($el);

          debug.log('list', `${containerSelector} added item:`, key);
          
          // Use first element of new set as anchor
          const newEl = $el[0];
          if (newEl) nextNode = newEl;
        }
      }

      oldKeys = newKeys;
    });

    registry.trackEffect(this, fx);
    registry.trackCleanup(this, () => {
      itemMap.clear();
      oldKeys = [];
      $emptyEl?.remove();
    });
  });
};

