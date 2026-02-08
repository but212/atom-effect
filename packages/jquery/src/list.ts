import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registry } from './registry';
import type { ListOptions, ReadonlyAtom } from './types';
import { getLIS, getSelector, sanitizeHtml } from './utils';

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
      : (item: T, _index: number) => item[key as keyof T] as unknown as string | number;

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
          // Use type assertion to avoid overload ambiguity while maintaining JQuery return type
          const safeEmpty = typeof empty === 'string' ? sanitizeHtml(empty) : empty;
          $emptyEl = ($(safeEmpty as string) as JQuery).appendTo($container);
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

      // 2. Build Old Index Map (O(M))
      const oldIndexMap = new Map<string | number, number>();
      const oldLen = oldKeys.length;
      for (let i = 0; i < oldLen; i++) {
        oldIndexMap.set(oldKeys[i]!, i);
      }

      // 3. Prepare keys and LIS indices in a single pass (O(N))
      const newKeys: (string | number)[] = new Array(itemCount);
      const newKeySet = new Set<string | number>();
      const newIndices = new Int32Array(itemCount);

      for (let i = 0; i < itemCount; i++) {
        const item = items[i] as T;
        const k = getKey(item, i);

        if (newKeySet.has(k)) {
          console.warn(`[atomList] Duplicate key "${k}" at index ${i}.`);
        }

        newKeys[i] = k;
        newKeySet.add(k);
        newIndices[i] = oldIndexMap.get(k) ?? -1;
      }

      // 4. Remove vanished items (O(M))
      if (itemMap.size > 0) {
        for (const [k, entry] of itemMap) {
          if (newKeySet.has(k) || removingKeys.has(k)) continue;

          const cleanupItem = () => {
            entry.$el.remove();
            if (entry.$el[0]) registry.cleanup(entry.$el[0]);
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
      }

      // After removals, check if we can skip the rest
      if (itemCount === 0) {
        oldKeys = [];
        return;
      }

      // 5. Get LIS (O(N log N))
      const lisArr = getLIS(newIndices);
      let lisIdx = lisArr.length - 1;

      // 6. Update and Reorder (Backwards iteration for insertBefore efficiency)
      let nextNode: Node | null = null;
      for (let i = itemCount - 1; i >= 0; i--) {
        const k = newKeys[i]!;
        const item = items[i]!;
        const entry = itemMap.get(k);

        if (entry) {
          // Existing Item Path
          const oldItem = entry.item;
          entry.item = item;
          const el = entry.$el[0];
          if (!el) continue;

          if (update) {
            update(entry.$el, item, i);
            debug.domUpdated(entry.$el, 'list.update', item);
          } else if (oldItem !== item) {
            // Optimized shallow equal (O(K) without Object.keys allocations)
            let isChanged = true;
            if (
              typeof oldItem === 'object' &&
              oldItem !== null &&
              typeof item === 'object' &&
              item !== null
            ) {
              isChanged = false;
              let countA = 0;
              const objA = oldItem as Record<string, unknown>;
              const objB = item as Record<string, unknown>;
              for (const prop in objA) {
                if (objA[prop] !== objB[prop]) {
                  isChanged = true;
                  break;
                }
                countA++;
              }
              if (!isChanged) {
                let countB = 0;
                for (const _prop in objB) {
                  countB++;
                  if (countB > countA) {
                    isChanged = true;
                    break;
                  }
                }
                if (countA !== countB) isChanged = true;
              }
            }

            if (isChanged) {
              const rawRender = render(item, i);
              const safeRender = typeof rawRender === 'string' ? sanitizeHtml(rawRender) : rawRender;
              const $newEl = $(safeRender as string) as JQuery;
              const needsNextNodeUpdate = nextNode === el;
              entry.$el.replaceWith($newEl);
              entry.$el = $newEl;
              if (bind) bind($newEl, item, i);
              debug.domUpdated($newEl, 'list.render', item);
              if (needsNextNodeUpdate) nextNode = $newEl[0] || null;
            }
          }

          // Move if not in LIS
          if (lisIdx >= 0 && lisArr[lisIdx] === i) {
            lisIdx--;
          } else {
            const currentEl = entry.$el[0]!;
            if (nextNode?.isConnected) {
              if (nextNode !== currentEl) entry.$el.insertBefore(nextNode);
            } else {
              entry.$el.appendTo($container);
            }
          }
          nextNode = entry.$el[0] || null;
        } else {
          // New Item Path
          const rendered = render(item, i);
          const safeRendered = typeof rendered === 'string' ? sanitizeHtml(rendered) : rendered;
          const $el = $(safeRendered as string) as JQuery;
          itemMap.set(k, { $el, item });

          if (nextNode?.isConnected) $el.insertBefore(nextNode);
          else $el.appendTo($container);

          if (bind) bind($el, item, i);
          if (onAdd) onAdd($el);

          debug.domUpdated($el, 'list.add', item);
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
