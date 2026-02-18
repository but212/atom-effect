import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { ListOptions, ReadonlyAtom } from './types';
import { getLIS, getSelector, sanitizeHtml, shallowEqual } from './utils';

/**
 * Renders an item to a jQuery element, sanitizing string output.
 */
function renderItem<T>(
  render: ListOptions<T>['render'],
  item: T,
  index: number
): JQuery {
  const raw = render(item, index);
  const safe = typeof raw === 'string' ? sanitizeHtml(raw) : raw;
  return $(safe as string) as JQuery;
}

/**
 * Inserts $el before nextNode if connected, otherwise appends to $container.
 */
function insertOrAppend($el: JQuery, nextNode: Node | null, $container: JQuery): void {
  if (nextNode?.isConnected) $el.insertBefore(nextNode);
  else $el.appendTo($container);
}

/**
 * atomList with LIS-based reconciliation.
 */
$.fn.atomList = function <T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  const { key, render, bind, update, onAdd, onRemove, empty } = options;

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

    /**
     * Schedules DOM removal after optional async onRemove transition.
     * Captures $el and el at schedule time so re-insertion of the same key
     * does not cause the deferred cleanup to remove the newly added node.
     */
    const scheduleRemoval = (k: string | number, entry: { $el: JQuery; item: T }) => {
      const el = entry.$el[0];

      const commitRemoval = () => {
        // entry.$el was captured when the item was removed from itemMap.
        // If the same key was re-added later, removingKeys will have been
        // cleared by the new item path — but $el is a distinct old reference,
        // so removing it is always safe.
        entry.$el.remove();
        if (el) registry.cleanup(el);
        removingKeys.delete(k);
        debug.log('list', `${containerSelector} removed item:`, k);
      };

      if (onRemove) {
        const result = onRemove(entry.$el);
        if (result instanceof Promise) result.then(commitRemoval);
        else commitRemoval();
      } else {
        commitRemoval();
      }
    };

    const fx = effect(() => {
      const items = source.value;
      const itemCount = items.length;

      // Show/hide empty placeholder and short-circuit when there is nothing to reconcile.
      if (itemCount === 0) {
        if (empty && !$emptyEl) {
          const safeEmpty = typeof empty === 'string' ? sanitizeHtml(empty) : empty;
          $emptyEl = ($(safeEmpty as string) as JQuery).appendTo($container);
        }
        if (itemMap.size === 0) {
          oldKeys = [];
          return;
        }
      } else if ($emptyEl) {
        $emptyEl.remove();
        $emptyEl = null;
      }

      debug.log('list', `${containerSelector} updating with ${itemCount} items`);

      // Build old-key → old-index map for O(1) LIS index lookups (O(M)).
      const oldIndexMap = new Map<string | number, number>();
      for (let i = 0; i < oldKeys.length; i++) {
        oldIndexMap.set(oldKeys[i]!, i);
      }

      // Build new key set and LIS source indices in one pass (O(N)).
      // Keys still undergoing async removal are treated as absent (-1)
      // so their stale positions don't distort LIS for surviving items.
      const newKeys: (string | number)[] = new Array(itemCount);
      const newKeySet = new Set<string | number>();
      const newIndices = new Int32Array(itemCount);

      for (let i = 0; i < itemCount; i++) {
        const item = items[i] as T;
        const k = getKey(item, i);

        if (newKeySet.has(k)) {
          console.warn(`${LOG_PREFIXES.LIST} ${ERROR_MESSAGES.DUPLICATE_KEY(k, i)}`);
        }

        newKeys[i] = k;
        newKeySet.add(k);
        newIndices[i] = removingKeys.has(k) ? -1 : (oldIndexMap.get(k) ?? -1);
      }

      // Schedule removal for items that have left the list (O(M)).
      for (const [k, entry] of itemMap) {
        if (newKeySet.has(k) || removingKeys.has(k)) continue;
        itemMap.delete(k);
        removingKeys.add(k);
        scheduleRemoval(k, entry);
      }

      if (itemCount === 0) {
        oldKeys = [];
        return;
      }

      // Reorder and update — backwards so insertBefore always has a valid anchor.
      const lisArr = getLIS(newIndices);
      let lisIdx = lisArr.length - 1;
      let nextNode: Node | null = null;

      for (let i = itemCount - 1; i >= 0; i--) {
        const k = newKeys[i]!;
        const item = items[i]!;
        const entry = itemMap.get(k);

        if (entry) {
          // Existing item: update content if needed, then reposition if outside LIS.
          const oldItem = entry.item;
          entry.item = item;
          const el = entry.$el[0];
          if (!el) continue;

          if (update) {
            update(entry.$el, item, i);
            debug.domUpdated(entry.$el, 'list.update', item);
          } else if (oldItem !== item && !shallowEqual(oldItem, item)) {
            const $newEl = renderItem(render, item, i);
            const needsNextNodeUpdate = nextNode === el;
            registry.cleanup(el);
            entry.$el.replaceWith($newEl);
            entry.$el = $newEl;
            if (bind) bind($newEl, item, i);
            debug.domUpdated($newEl, 'list.render', item);
            if (needsNextNodeUpdate) nextNode = $newEl[0] ?? null;
          }

          if (lisIdx >= 0 && lisArr[lisIdx] === i) {
            lisIdx--;
          } else {
            insertOrAppend(entry.$el, nextNode, $container);
          }
          nextNode = entry.$el[0] ?? null;
        } else {
          // New item: render, insert, and cancel any pending async removal for this key.
          const $el = renderItem(render, item, i);
          itemMap.set(k, { $el, item });
          removingKeys.delete(k);

          insertOrAppend($el, nextNode, $container);
          if (bind) bind($el, item, i);
          if (onAdd) onAdd($el);

          debug.domUpdated($el, 'list.add', item);
          nextNode = $el[0] ?? null;
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
