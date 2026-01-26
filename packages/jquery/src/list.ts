import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registry } from './registry';
import type { ListOptions, ReadonlyAtom } from './types';
import { getLIS, getSelector } from './utils';

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

    // Local pools to minimize GC pressure during updates
    const newKeySet = new Set<string | number>();
    const oldIndexMap = new Map<string | number, number>();

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

      // 2. Prepare keys (O(N) with reused Set)
      newKeySet.clear();
      const newKeys: (string | number)[] = new Array(itemCount);

      for (let i = 0; i < itemCount; i++) {
        const k = getKey(items[i] as T, i);

        if (debug.enabled && newKeySet.has(k)) {
          console.warn(`[atomList] Duplicate key "${k}" at index ${i}.`);
        }

        newKeys[i] = k;
        newKeySet.add(k);
      }

      // 3. Remove vanished items (O(M))
      for (const [k, entry] of itemMap) {
        if (newKeySet.has(k) || removingKeys.has(k)) continue;

        const cleanupItem = () => {
          entry.$el.remove();
          const el = entry.$el[0];
          if (el) registry.cleanup(el);
          removingKeys.delete(k);
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

      if (itemCount === 0) {
        oldKeys = [];
        return;
      }

      // 4. LIS Reconciliation
      oldIndexMap.clear();
      for (let i = 0, len = oldKeys.length; i < len; i++) {
        const k = oldKeys[i];
        if (k !== undefined) oldIndexMap.set(k, i);
      }

      const newIndices = new Int32Array(itemCount);
      for (let i = 0; i < itemCount; i++) {
        const k = newKeys[i];
        newIndices[i] = k !== undefined ? (oldIndexMap.get(k) ?? -1) : -1;
      }

      const lisArr = getLIS(newIndices);
      let lisIdx = lisArr.length - 1;

      // 5. Update and Reorder (Backwards iteration)
      let nextNode: Node | null = null;
      for (let i = itemCount - 1; i >= 0; i--) {
        const k = newKeys[i]!;
        const item = items[i]!;
        const entry = itemMap.get(k);

        if (entry) {
          entry.item = item;
          const el = entry.$el[0];
          if (!el) continue;

          if (update) update(entry.$el, item, i);

          const isStable = lisIdx >= 0 && lisArr[lisIdx] === i;
          if (isStable) {
            lisIdx--;
            if (el.nextSibling !== nextNode) {
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
          const rendered = render(item, i);
          const $el = (rendered instanceof Element ? $(rendered) : $(rendered as string)) as JQuery;
          itemMap.set(k, { $el, item });

          if (nextNode) $el.insertBefore(nextNode);
          else $el.appendTo($container);

          if (bind) bind($el, item, i);
          if (onAdd) onAdd($el);
          nextNode = $el[0] || null;
        }
      }

      oldKeys = newKeys;
    });

    registry.trackEffect(this, fx);
    registry.trackCleanup(this, () => {
      itemMap.clear();
      removingKeys.clear();
      newKeySet.clear();
      oldIndexMap.clear();
      oldKeys = [];
      $emptyEl?.remove();
    });
  });
};
