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
  const { key, render, bind, update, onAdd, onRemove, empty, events } = options;

  const getKey =
    typeof key === 'function'
      ? key
      : (item: T, _index: number) => item[key as keyof T] as unknown as string | number;

  for (
    let containerIdx = 0, containerLen = this.length;
    containerIdx < containerLen;
    containerIdx++
  ) {
    const rawContainer = this[containerIdx]!;
    const $container = $(rawContainer);
    const containerSelector = getSelector(rawContainer);

    const itemMap = new Map<
      string | number,
      { $el: JQuery; item: T; state?: 'new' | 'replaced' | undefined }
    >();
    const removingKeys = new Set<string | number>();
    let oldKeys: (string | number)[] = [];
    let $emptyEl: JQuery | null = null;

    // Reverse index: root Element → item key.
    // Kept in sync with itemMap so delegated event handlers can resolve the
    // owning entry in O(1) instead of walking the entire itemMap.
    const elToKey = new WeakMap<Element, string | number>();

    // Forward index: key → current list position.
    // Updated at the end of every effect run alongside oldKeys so that
    // delegated handlers read the correct index without a linear search.
    const keyToIndex = new Map<string | number, number>();

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

      if (!onRemove) {
        commitRemoval();
        return;
      }

      const result = onRemove(entry.$el);
      if (result instanceof Promise) {
        result.then(commitRemoval, commitRemoval);
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
          for (let i = 0; i < oldKeys.length; i++) {
            const k = oldKeys[i]!;
            const entry = itemMap.get(k);
            if (entry) removeItem(k, entry);
          }
          oldKeys.length = 0;
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
        // Parallel arrays replace an array-of-objects to reduce GC pressure and
        // improve cache locality when iterating targetsToRender (step 3).
        const trKeys: (string | number)[] = [];
        const trItems: T[] = [];
        const trIdxs: number[] = [];

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
              trKeys.push(k);
              trItems.push(item);
              trIdxs.push(i);
            }
            newIndices[i] = removingKeys.has(k) ? -1 : (oldIndexMap.get(k) ?? -1);
          } else {
            trKeys.push(k);
            trItems.push(item);
            trIdxs.push(i);
            newIndices[i] = -1;
          }
        }

        // 3. Render New/Updated Items (Batch Sanitization)
        const renderCount = trKeys.length;
        const renderResults: Array<string | Element | DocumentFragment | JQuery> = new Array(
          renderCount
        );
        const htmlParts: string[] = [];

        for (let t = 0; t < renderCount; t++) {
          const raw = render(trItems[t]!, trIdxs[t]!);
          renderResults[t] = raw;
          if (typeof raw === 'string') {
            htmlParts.push(raw);
          }
        }

        // Sanitize rendered HTML strings.
        //
        // Strategy depends on the number of string parts:
        //
        // • 0 parts  — nothing to do.
        // • 1 part   — call sanitizeHtml once directly; join/split adds pure overhead.
        // • ≥2 parts — batch via join/split to pay sanitizeHtml's regex cost once
        //              instead of N times.  A random HTML-comment separator is generated
        //              per batch so it cannot collide with user content regardless of
        //              what the render function returns.
        let sanitizedFragments: string[] | null = null;
        const htmlPartCount = htmlParts.length;
        if (htmlPartCount === 1) {
          sanitizedFragments = [sanitizeHtml(htmlParts[0]!)];
        } else if (htmlPartCount > 1) {
          const batchSeparator = `<!--sep-${Math.random().toString(36).substring(2)}-${Date.now().toString(36)}-->`;
          sanitizedFragments = sanitizeHtml(htmlParts.join(batchSeparator)).split(batchSeparator);
        }

        // Create $el for each target
        let fragIdx = 0;
        for (let t = 0; t < renderCount; t++) {
          const raw = renderResults[t]!;
          const $el =
            typeof raw === 'string'
              ? $(sanitizedFragments![fragIdx++]!)
              : ($(raw as never) as JQuery);

          const k = trKeys[t]!;
          const entry = itemMap.get(k);
          if (entry) {
            const oldEl = entry.$el[0];
            if (oldEl) registry.cleanupTree(oldEl);
            entry.$el.replaceWith($el);
            entry.$el = $el;
            entry.state = 'replaced';
          } else {
            itemMap.set(k, { $el, item: null as unknown as T, state: 'new' });
          }
        }

        // 4. Cleanup Removed Keys
        // Array iteration is faster than itemMap entries iteration,
        // and safely skips keys already in removingKeys since oldKeys
        // never overlaps with them.
        for (let i = 0; i < oldKeys.length; i++) {
          const k = oldKeys[i]!;
          if (!newKeySet.has(k)) {
            const entry = itemMap.get(k);
            if (entry) removeItem(k, entry);
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
          fragIdx === renderCount &&
          !bind &&
          !onAdd &&
          !onRemove &&
          removingKeys.size === 0;

        if (useInnerHtml) {
          rawContainer.innerHTML = sanitizedFragments!.join('');

          // Map children back to itemMap entries
          let childIdx = 0;
          for (let i = 0; i < itemCount; i++) {
            const k = newKeys[i]!;
            const item = items[i]!;
            const entry = itemMap.get(k);
            if (!entry) continue;

            const el = rawContainer.children[childIdx++] as HTMLElement | undefined;
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

          if (isInitial && fragment) {
            // ── Initial render: accumulate into DocumentFragment ──────────────
            // Loop-invariant branch hoisted out: avoids per-iteration isInitial check.
            for (let i = itemCount - 1; i >= 0; i--) {
              const k = newKeys[i]!;
              const item = items[i]!;
              const entry = itemMap.get(k);
              if (!entry) continue;

              const state = entry.state;
              entry.item = item;
              entry.state = undefined;

              if (entry.$el[0]) {
                if (state === undefined) {
                  if (update) update(entry.$el, item, i);
                } else if (bind) {
                  bind(entry.$el, item, i);
                }
              }

              for (let j = entry.$el.length - 1; j >= 0; j--) {
                fragment.insertBefore(entry.$el[j]!, fragment.firstChild);
              }

              if (state === 'new') {
                if (onAdd) onAdd(entry.$el);
                removingKeys.delete(k);
                debug.domUpdated(entry.$el, 'list.add', item);
              }
            }
            rawContainer.appendChild(fragment);
          } else {
            // ── Incremental update: LIS-based reconciliation ──────────────────
            for (let i = itemCount - 1; i >= 0; i--) {
              const k = newKeys[i]!;
              const item = items[i]!;
              const entry = itemMap.get(k);
              if (!entry) continue;

              const state = entry.state;
              entry.item = item;
              entry.state = undefined;

              if (entry.$el[0]) {
                if (state === undefined) {
                  if (update) update(entry.$el, item, i);
                } else if (bind) {
                  bind(entry.$el, item, i);
                }
              }

              if (lisIdx >= 0 && lisArr[lisIdx] === i) {
                lisIdx--;
              } else {
                insertOrAppend(entry.$el, nextNode, $container);
              }

              nextNode = entry.$el[0] ?? null;

              if (state === 'new') {
                if (onAdd) onAdd(entry.$el);
                removingKeys.delete(k);
                debug.domUpdated(entry.$el, 'list.add', item);
              }
            }
          }
        }

        // Sync reverse/forward indexes for delegated event lookup.
        if (events) {
          // Remove stale entries for keys no longer in the list.
          for (let i = 0; i < oldKeys.length; i++) {
            const k = oldKeys[i]!;
            if (!newKeySet.has(k)) {
              const staleEl = itemMap.get(k)?.$el[0];
              if (staleEl) elToKey.delete(staleEl);
              keyToIndex.delete(k);
            }
          }
          // Register/update entries for keys in the new list.
          for (let i = 0; i < itemCount; i++) {
            const k = newKeys[i]!;
            const entry = itemMap.get(k);
            const rootEl = entry?.$el[0];
            if (rootEl) elToKey.set(rootEl, k);
            keyToIndex.set(k, i);
          }
        }

        oldKeys = newKeys;
      });
    });

    // ── Delegated event listeners ─────────────────────────────────────────
    // One listener per event type is attached to the container.
    // elToKey / keyToIndex provide O(1) target → item and key → index lookup,
    // avoiding a full itemMap scan on every event.
    if (events) {
      const eventEntries = Object.entries(events);
      for (let ei = 0; ei < eventEntries.length; ei++) {
        const [eventKey, handler] = eventEntries[ei]!;

        // Split "click .selector" → eventType="click", childSelector=".selector"
        const spaceIdx = eventKey.indexOf(' ');
        const eventType = spaceIdx === -1 ? eventKey : eventKey.slice(0, spaceIdx);
        const childSelector = spaceIdx === -1 ? null : eventKey.slice(spaceIdx + 1).trim();

        const delegateHandler = (e: JQuery.TriggeredEvent) => {
          const target = e.target as HTMLElement | null;
          if (!target) return;

          // Walk up from target to find the item root registered in elToKey.
          let node: HTMLElement | null = target;
          while (node && node !== rawContainer) {
            const k = elToKey.get(node);
            if (k !== undefined) {
              // If a child selector was specified, the matched element must exist
              // AND be a descendant of this item root (node). Without the contains()
              // check, target.closest() can escape upward past the container and
              // match an ancestor element that happens to share the selector.
              if (childSelector !== null) {
                const matched = target.closest(childSelector);
                if (!matched || !node.contains(matched)) return;
              }
              const entry = itemMap.get(k);
              if (!entry) return;
              handler(entry.item, keyToIndex.get(k) ?? -1, e);
              return;
            }
            node = node.parentElement;
          }
        };

        $container.on(eventType, delegateHandler);

        registry.trackCleanup(rawContainer, () => {
          $container.off(eventType, delegateHandler);
        });
      }
    }

    registry.trackEffect(rawContainer, fx);
    registry.trackCleanup(rawContainer, () => {
      itemMap.clear();
      removingKeys.clear();
      oldKeys.length = 0;
      keyToIndex.clear();
      $emptyEl?.remove();
    });
  }

  return this;
};
