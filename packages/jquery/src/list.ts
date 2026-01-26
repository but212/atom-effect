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

    const fx = effect(() => {
      const items = source.value;
      const itemCount = items.length;

      // 1. Handle Empty Template Logic
      if (itemCount === 0) {
        if (empty && !$emptyEl) {
          // biome-ignore lint/suspicious/noExplicitAny: temporary typing
          $emptyEl = $(empty as any).appendTo($container);
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

        // DEV: Warn about duplicate keys
        if (debug.enabled && newKeySet.has(k)) {
          console.warn(
            `[atomList] Duplicate key "${k}" at index ${i}. ` +
              `Items with duplicate keys may cause unexpected behavior.`
          );
        }

        newKeys[i] = k;
        newKeySet.add(k);
      }

      // 3. Remove vanished items (O(M)) - Respects onRemove callback
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

      // If we adjusted from non-empty to empty, we can stop here after removal
      if (itemCount === 0) {
        oldKeys = [];
        return;
      }

      // 4. LIS Reconciliation (O(N log N))
      // Map keys to their OLD index for LIS input
      const oldIndexMap = new Map<string | number, number>();
      for (let i = 0, len = oldKeys.length; i < len; i++) {
        oldIndexMap.set(oldKeys[i]!, i);
      }

      // Input for LIS: where each new item came from in the old list
      const newIndices = new Int32Array(itemCount);
      for (let i = 0; i < itemCount; i++) {
        newIndices[i] = oldIndexMap.get(newKeys[i]!) ?? -1;
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
          const oldItem = entry.item;
          entry.item = item;
          const el = entry.$el[0];
          if (!el) continue;

          if (update) {
            update(entry.$el, item, i);
            debug.domUpdated(entry.$el, 'list.update', item);
          } else if (oldItem !== item) {
            // Check for shallow equality to avoid unnecessary re-renders (preserves focus)
            let isChanged = true;
            if (
              typeof oldItem === 'object' &&
              oldItem !== null &&
              typeof item === 'object' &&
              item !== null
            ) {
              const keysA = Object.keys(oldItem as object);
              const keysB = Object.keys(item as object);
              if (keysA.length === keysB.length) {
                isChanged = false;
                for (const k of keysA) {
                  // biome-ignore lint/suspicious/noExplicitAny: temporary typing
                  if ((oldItem as any)[k] !== (item as any)[k]) {
                    isChanged = true;
                    break;
                  }
                }
              }
            }

            if (isChanged) {
              // Fallback: Data changed and no update function -> Re-render
              // biome-ignore lint/suspicious/noExplicitAny: temporary typing
              const $newEl = $(render(item, i) as any);
              const needsNextNodeUpdate = nextNode === el;

              entry.$el.replaceWith($newEl);
              entry.$el = $newEl;
              if (bind) bind($newEl, item, i);

              debug.domUpdated($newEl, 'list.render', item);

              if (needsNextNodeUpdate) {
                nextNode = $newEl[0] || null;
              }
            }
          }

          const isStable = lisIdx >= 0 && lisArr[lisIdx] === i;
          if (isStable) {
            lisIdx--;
          } else if (nextNode) {
            // Check if nextNode is still in DOM (sanity check for duplicates/replacements)
            if (nextNode.isConnected && nextNode !== entry.$el[0]) {
              entry.$el.insertBefore(nextNode);
            } else if (!nextNode.isConnected) {
              // Fallback if nextNode somehow got detached (shouldn't happen with patch)
              entry.$el.appendTo($container);
            }
            // If nextNode === entry.$el[0], do nothing (already there/reordered virtually)
          } else {
            entry.$el.appendTo($container);
          }
          nextNode = entry.$el[0] || null;
        } else {
          // New Item: Render and INSERT
          const rendered = render(item, i);
          // biome-ignore lint/suspicious/noExplicitAny: temporary typing
          const $el = $(rendered as any);
          itemMap.set(k, { $el, item });

          if (nextNode?.isConnected) $el.insertBefore(nextNode);
          else $el.appendTo($container);

          if (bind) bind($el, item, i);
          if (onAdd) onAdd($el);

          debug.domUpdated($el, 'list.add', item);
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
