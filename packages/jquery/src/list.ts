import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { ListOptions, ReadonlyAtom } from './types';
import { getLIS, getSelector, sanitizeHtml, shallowEqual } from './utils';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Renders an item to a jQuery element.
 * String output is sanitized against XSS; a warning is emitted if the content
 * was modified so callers are aware of unsafe markup.
 */
function renderItem<T>(render: ListOptions<T>['render'], item: T, index: number): JQuery {
  const raw = render(item, index);
  if (typeof raw === 'string') {
    const sanitized = sanitizeHtml(raw);
    if (sanitized !== raw) {
      debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.UNSAFE_CONTENT());
    }
    return $(sanitized);
  }
  // Element, DocumentFragment, or JQuery — pass through directly.
  // The cast to `never` is required because jQuery's overloads do not expose
  // a single unified signature for all DOM-compatible input types, but the
  // runtime handles all of them correctly.
  return $(raw as never) as JQuery;
}

/**
 * Inserts `$el` before `nextNode` when `nextNode` is non-null and connected,
 * otherwise appends it to `$container`.
 */
function insertOrAppend($el: JQuery, nextNode: Node | null, $container: JQuery): void {
  if (nextNode?.isConnected) $el.insertBefore(nextNode);
  else $el.appendTo($container);
}

// ============================================================================
// atomList
// ============================================================================

/**
 * Reactive list rendering with LIS-based DOM reconciliation.
 *
 * Note: when `key` is a property name string, the resolved property value is
 * used as the Map key. The property must produce a `string | number` at
 * runtime — boolean or object values will be coerced by the Map and may cause
 * unexpected key collisions.
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
     * Schedules DOM removal after an optional async `onRemove` transition.
     * `$el` is captured at schedule time so a re-insertion of the same key
     * does not cause the deferred cleanup to remove the new node.
     *
     * On Promise rejection the removal is still committed — a failed
     * transition must not leave the element stranded in `removingKeys`.
     */
    const scheduleRemoval = (k: string | number, entry: { $el: JQuery; item: T }) => {
      const commitRemoval = () => {
        // entry.$el is the captured reference from when the item was removed.
        // If the same key was re-added, removingKeys will have been cleared by
        // the new-item path, but this $el is a distinct old reference so
        // removing it is always safe.
        // $.fn.remove is patched by jquery-patch to call registry.cleanupTree,
        // so no manual registry call is needed here.
        entry.$el.remove();
        // Always delete from removingKeys regardless of whether el existed —
        // an absent el still means the removal is complete.
        removingKeys.delete(k);
        debug.log('list', `${containerSelector} removed item:`, k);
      };

      if (onRemove) {
        const result = onRemove(entry.$el);
        if (result instanceof Promise) {
          // Use then(onFulfilled, onRejected) so that a rejected transition
          // still commits removal — preventing permanent key/DOM leaks.
          result.then(commitRemoval, commitRemoval);
        } else {
          commitRemoval();
        }
      } else {
        commitRemoval();
      }
    };

    // Removes an item from itemMap and schedules its DOM removal.
    // Extracted to eliminate the repeated 3-line sequence in the empty-state
    // and departed-key paths.
    const removeItem = (k: string | number, entry: { $el: JQuery; item: T }) => {
      itemMap.delete(k);
      removingKeys.add(k);
      scheduleRemoval(k, entry);
    };

    const fx = effect(() => {
      const items = source.value;
      const itemCount = items.length;

      // ── Empty state ────────────────────────────────────────────────────────
      // Manage the placeholder and skip reconciliation when there is nothing
      // to do. Both the "already empty with no items" early-exit and the
      // "just became empty" removal path are handled in a single block.

      if ($emptyEl && itemCount > 0) {
        $emptyEl.remove();
        $emptyEl = null;
      }

      if (itemCount === 0) {
        if (empty && !$emptyEl) {
          if (typeof empty === 'string') {
            const sanitized = sanitizeHtml(empty);
            if (sanitized !== empty) {
              debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.UNSAFE_CONTENT());
            }
            $emptyEl = ($(sanitized) as JQuery).appendTo($container);
          } else {
            $emptyEl = ($(empty as never) as JQuery).appendTo($container);
          }
        }

        // Remove departing items even when the new list is empty.
        itemMap.forEach((entry, k) => {
          if (!removingKeys.has(k)) removeItem(k, entry);
        });

        oldKeys = [];
        return;
      }

      debug.log('list', `${containerSelector} updating with ${itemCount} items`);

      // ── Build index structures (O(M) + O(N)) ──────────────────────────────

      const oldIndexMap = new Map<string | number, number>();
      oldKeys.forEach((oldKey, i) => {
        oldIndexMap.set(oldKey, i);
      });

      const newKeys: (string | number)[] = new Array(itemCount);
      const newKeySet = new Set<string | number>();
      const newIndices = new Int32Array(itemCount);

      for (let i = 0; i < itemCount; i++) {
        const item = items[i]!;
        const k = getKey(item, i);

        // Assign key unconditionally — both the duplicate and normal paths need it.
        newKeys[i] = k;

        if (newKeySet.has(k)) {
          // Duplicate key: warn and skip this entry to prevent the first
          // occurrence's DOM node from being silently orphaned/overwritten.
          debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.DUPLICATE_KEY(k, i));
          newIndices[i] = -1; // treat as absent so LIS is not distorted
          continue;
        }

        newKeySet.add(k);
        // Keys mid-removal are treated as absent (-1) so their stale
        // old-positions don't anchor surviving items incorrectly.
        newIndices[i] = removingKeys.has(k) ? -1 : (oldIndexMap.get(k) ?? -1);
      }

      // ── Schedule removals for departed keys (O(M)) ────────────────────────

      for (const [k, entry] of itemMap) {
        if (newKeySet.has(k) || removingKeys.has(k)) continue;
        removeItem(k, entry);
      }

      // ── Reorder and patch — backwards for stable insertBefore anchors ─────

      const lisArr: Int32Array = getLIS(newIndices);
      let lisIdx = lisArr.length - 1;
      let nextNode: Node | null = null;

      for (let i = itemCount - 1; i >= 0; i--) {
        const k = newKeys[i]!;
        const item = items[i]!;
        const entry = itemMap.get(k);

        if (entry) {
          // Existing item: optionally update content, then reposition if
          // outside the longest stable subsequence.
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
            // cleanupTree disposes el's own bindings AND all descendant
            // bindings — replaceWith is not patched so cleanup is manual.
            registry.cleanupTree(el);
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
          // New item: render, track, insert, and cancel any in-flight async
          // removal for this key (same-key re-add before transition completes).
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
      // $.fn.remove is patched — this call automatically triggers
      // registry.cleanupTree on $emptyEl and its descendants.
      $emptyEl?.remove();
    });
  });
};
