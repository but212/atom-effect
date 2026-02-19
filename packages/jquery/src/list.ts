import { effect, untracked } from '@but212/atom-effect';
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
function _renderItem<T>(render: ListOptions<T>['render'], item: T, index: number): JQuery {
  const raw = render(item, index);
  if (typeof raw === 'string') {
    return $(sanitizeHtml(raw));
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

  return this.each(function (this: HTMLElement) {
    const $container = $(this);
    const containerSelector = getSelector(this);

    const itemMap = new Map<
      string | number,
      { $el: JQuery; item: T; state?: 'new' | 'replaced' | undefined }
    >();
    const removingKeys = new Set<string | number>();
    let oldKeys: (string | number)[] = [];
    let $emptyEl: JQuery | null = null;

    /**
     * Schedules DOM removal after an optional async `onRemove` transition.
     */
    const scheduleRemoval = (k: string | number, entry: { $el: JQuery; item: T }) => {
      const commitRemoval = () => {
        if (fx?.isDisposed) return; // Container already torn down — skip stale DOM work
        entry.$el.remove();
        removingKeys.delete(k);
        debug.log('list', `${containerSelector} removed item:`, k);
      };

      if (onRemove) {
        const result = onRemove(entry.$el);
        if (result instanceof Promise) {
          result.then(commitRemoval, commitRemoval);
        } else {
          commitRemoval();
        }
      } else {
        commitRemoval();
      }
    };

    const removeItem = (k: string | number, entry: { $el: JQuery; item: T }) => {
      itemMap.delete(k);
      removingKeys.add(k);
      scheduleRemoval(k, entry);
    };

    // Declare fx with let so scheduleRemoval's closure can reference it after assignment.
    let fx: ReturnType<typeof effect>;

    fx = effect(() => {
      // Only source.value is tracked. All side effects (DOM reads/writes,
      // render calls, bind calls) ran inside untracked() so they cannot
      // accidentally subscribe the list effect to atom reads within user callbacks.
      const items = source.value;
      const itemCount = items.length;

      untracked(() => {
        // 1. Handle Empty Template
        if ($emptyEl && itemCount > 0) {
          $emptyEl.remove();
          $emptyEl = null;
        }

        if (itemCount === 0) {
          if (empty && !$emptyEl) {
            const safeEmpty = typeof empty === 'string' ? sanitizeHtml(empty) : empty;
            $emptyEl = ($(safeEmpty as string) as JQuery).appendTo($container);
          }
          itemMap.forEach((entry, k) => {
            if (!removingKeys.has(k)) removeItem(k, entry);
          });
          oldKeys = [];
          return;
        }

        debug.log('list', `${containerSelector} updating with ${itemCount} items`);

        // 2. Build index structures
        const oldIndexMap = new Map<string | number, number>();
        for (let i = 0; i < oldKeys.length; i++) {
          oldIndexMap.set(oldKeys[i]!, i);
        }

        const newKeys: (string | number)[] = new Array(itemCount);
        const newKeySet = new Set<string | number>();
        const newIndices = new Int32Array(itemCount);
        const targetsToRender: { k: string | number; item: T; idx: number }[] = [];

        for (let i = 0; i < itemCount; i++) {
          const item = items[i]!;
          const k = getKey(item, i);
          newKeys[i] = k;

          if (newKeySet.has(k)) {
            debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.DUPLICATE_KEY(k, i));
            newIndices[i] = -1;
            continue;
          }
          newKeySet.add(k);

          const entry = itemMap.get(k);
          if (entry) {
            const oldItem = entry.item;
            if (!update && oldItem !== item && !shallowEqual(oldItem, item)) {
              targetsToRender.push({ k, item, idx: i });
            }
            newIndices[i] = removingKeys.has(k) ? -1 : (oldIndexMap.get(k) ?? -1);
          } else {
            targetsToRender.push({ k, item, idx: i });
            newIndices[i] = -1;
          }
        }

        // 3. Render New/Updated Items (Batch Sanitization)
        const SEPARATOR = '<!--sep-->';
        const renderResults: Array<string | Element | DocumentFragment | JQuery> = new Array(
          targetsToRender.length
        );
        const htmlParts: string[] = [];
        const htmlPartIndices: number[] = [];

        for (let t = 0; t < targetsToRender.length; t++) {
          const raw = render(targetsToRender[t]!.item, targetsToRender[t]!.idx);
          renderResults[t] = raw;
          if (typeof raw === 'string') {
            htmlParts.push(raw);
            htmlPartIndices.push(t);
          }
        }

        // Batch sanitize: N calls → 1 call
        let sanitizedFragments: string[] | null = null;
        if (htmlParts.length > 0) {
          const combined = htmlParts.join(SEPARATOR);
          const sanitized = sanitizeHtml(combined);
          sanitizedFragments = sanitized.split(SEPARATOR);
        }

        // Create $el for each target
        let fragIdx = 0;
        for (let t = 0; t < targetsToRender.length; t++) {
          const target = targetsToRender[t]!;
          const raw = renderResults[t]!;
          const $el =
            typeof raw === 'string'
              ? $(sanitizedFragments![fragIdx++]!)
              : ($(raw as never) as JQuery);

          const entry = itemMap.get(target.k);
          if (entry) {
            const oldEl = entry.$el[0];
            if (oldEl) registry.cleanupTree(oldEl);
            entry.$el.replaceWith($el);
            entry.$el = $el;
            entry.state = 'replaced';
          } else {
            itemMap.set(target.k, { $el, item: null as unknown as T, state: 'new' });
          }
        }

        // 4. Cleanup Removed Keys
        for (const [k, entry] of itemMap) {
          if (!newKeySet.has(k) && !removingKeys.has(k)) {
            removeItem(k, entry);
          }
        }

        // 5. Place and Reorder via LIS
        const lisArr = getLIS(newIndices);
        let lisIdx = lisArr.length - 1;
        let nextNode: Node | null = null;
        const isInitial = oldKeys.length === 0;

        // innerHTML fast path: initial render, all string renders, no callbacks,
        // and no elements currently mid-removal (innerHTML would destroy them).
        const useInnerHtml =
          isInitial &&
          sanitizedFragments !== null &&
          fragIdx === targetsToRender.length &&
          !bind &&
          !onAdd &&
          !onRemove &&
          removingKeys.size === 0;

        if (useInnerHtml) {
          this.innerHTML = sanitizedFragments!.join('');

          // Map children back to itemMap entries
          let childIdx = 0;
          for (let i = 0; i < itemCount; i++) {
            const k = newKeys[i]!;
            const item = items[i]!;
            const entry = itemMap.get(k);
            if (!entry) continue;

            const el = this.children[childIdx++] as HTMLElement | undefined;
            if (el) {
              entry.$el = $(el);
              entry.item = item;
              entry.state = undefined;
              removingKeys.delete(k);
              debug.domUpdated(entry.$el, 'list.add', item);
            }
          }
        } else {
          const fragment = isInitial ? document.createDocumentFragment() : null;

          for (let i = itemCount - 1; i >= 0; i--) {
            const k = newKeys[i]!;
            const item = items[i]!;
            const entry = itemMap.get(k)!;
            if (!entry) continue;

            const state = entry.state;
            const isNewItem = state === 'new';
            const isReplaced = state === 'replaced';
            entry.item = item;
            entry.state = undefined;

            if (entry.$el[0]) {
              if (!isNewItem && !isReplaced && update) {
                update(entry.$el, item, i);
              } else if ((isNewItem || isReplaced) && bind) {
                bind(entry.$el, item, i);
              }
            }

            if (isInitial && fragment) {
              for (let j = entry.$el.length - 1; j >= 0; j--) {
                fragment.insertBefore(entry.$el[j]!, fragment.firstChild);
              }
              if (onAdd && isNewItem) onAdd(entry.$el);
            } else {
              if (lisIdx >= 0 && lisArr[lisIdx] === i) {
                lisIdx--;
              } else {
                insertOrAppend(entry.$el, nextNode, $container);
              }
              if (onAdd && isNewItem) onAdd(entry.$el);
              nextNode = entry.$el[0] ?? null;
            }

            if (isNewItem) {
              removingKeys.delete(k);
              debug.domUpdated(entry.$el, 'list.add', item);
            }
          }

          if (isInitial && fragment) {
            this.appendChild(fragment);
          }
        }

        oldKeys = newKeys;
      });
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
