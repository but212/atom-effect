import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector } from '@/utils';
import { createListContext, disposeListContext, getListIndex, type ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { EventBinding, PlaceCallbacks } from './types';

/**
 * Global WeakMap to track active list instances per DOM element.
 *
 * WHY: Enables external tools and the core registry to access reactive context
 * without polluting DOM nodes with internal properties.
 */
const instances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

/**
 * Internal engine for list reconciliation.
 *
 * When to use:
 * - Coordinates the full lifecycle: Empty state -> Diffing -> Rendering -> DOM placement.
 *
 * Boundary:
 * - Uses `untracked` to ensure DOM mutations don't accidentally trigger parent effects.
 * - Relies on `ListContext` for state persistence across render cycles.
 *
 * @internal
 */
export function applyListBinding<T>(
  element: HTMLElement,
  source: ReadonlyAtom<T[]>,
  options: ListOptions<T>
): { fx: EffectObject; ctx: ListContext<T> } {
  const { key, update, isEqual, empty, events, onRemove, bind, onAdd } = options;
  const $c = $(element);

  // 1. Lifecycle: Enforce single-binding per element by disposing old instances.
  const prev = instances.get(element);
  if (prev) {
    prev.fx.dispose();
    disposeListContext(prev.ctx);
  }

  // 2. Optimization: Pre-calculate lookup strategies to minimize work inside the effect loop.
  const getKey: ListKeyFn<T> =
    typeof key === 'function' ? key : (item: T) => item[key as keyof T] as unknown as ListKey;
  const callbacks: PlaceCallbacks<T> = { bind, update, onAdd, onRemove, events };
  const eventBindings = normalizeEvents(events);

  const ctx = createListContext<T>($c, getSelector(element), onRemove);

  const fx = effect(() => {
    // Accessing .value establishes the reactive dependency.
    const items = source.value;
    const count = items.length;

    untracked(() => {
      handleEmpty(ctx, count, $c, empty);
      if (count === 0) return;

      const isInitial = ctx.snapshots.length === 0 && ctx.removingKeys.size === 0;

      // Pipeline: Diff -> Render -> Cleanup -> Place
      const diff = buildIndices(ctx, items, count, getKey, update, isEqual);
      const fragment = renderItems(diff, options, isInitial);

      cleanupRemoved(ctx);
      placeItems(ctx, diff, element, callbacks, fragment);

      // Snapshot current state for the next O(N) diff cycle.
      ctx.snapshots = diff.slots.map(({ key, item, node }) => ({ key, item, node }));
    });
  });

  ctx.fx = fx;

  if (eventBindings.length > 0) {
    setupEvents(ctx, $c, eventBindings);
  }

  return { fx, ctx };
}

/**
 * High-performance reactive list renderer for jQuery.
 *
 * Usage Example:
 * ```javascript
 * $('#todo-list').atomList(todosAtom, {
 *   key: 'id',
 *   render: (todo) => `<li class="item">${todo.text}</li>`,
 *   events: {
 *     'click .remove': (todo, index, e) => removeTodo(todo.id)
 *   }
 * });
 * ```
 *
 * Lifecycle:
 * - Automatically cleans up via `registry` when the element is removed from DOM.
 * - Re-binding to the same element replaces the previous reactive effect.
 */
function atomList<T>(this: JQuery, source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    const element = this[i]!;
    const { fx, ctx } = applyListBinding(element, source, options);

    instances.set(element, { fx, ctx });
    registry.trackEffect(element, fx);
    registry.onCleanup(element, () => {
      disposeListContext(ctx);
      instances.delete(element);
    });
  }
  return this;
}

/**
 * Normalizes event strings into efficient binding tables.
 *
 * Performance:
 * - Uses manual string slicing instead of Regex to minimize memory allocations.
 * - Default selector `> *` targets direct children if no sub-selector is provided.
 */
function normalizeEvents<T>(events: ListOptions<T>['events']): EventBinding[] {
  if (!events) return [];

  const keys = Object.keys(events);
  const len = keys.length;
  const result: EventBinding[] = new Array(len);

  for (let i = 0; i < len; i++) {
    const eventKey = keys[i]!;
    const callback = events[eventKey]!;
    const trimmed = eventKey.trim();
    const spaceIdx = trimmed.indexOf(' ');

    let type: string;
    let selector: string;

    if (spaceIdx === -1) {
      type = trimmed;
      selector = '> *';
    } else {
      type = trimmed.substring(0, spaceIdx);
      selector = trimmed.substring(spaceIdx + 1).trim() || '> *';
    }

    result[i] = { type, selector, callback };
  }

  return result;
}

/**
 * Implements delegated event listeners for list items.
 *
 * Logic:
 * - Uses `closest('[data-atom-key]')` to find the relevant list item node.
 * - Maps the DOM key back to the source data via `ctx.snapshots` for the callback.
 */
function setupEvents<T>(ctx: ListContext<T>, $container: JQuery, bindings: EventBinding[]): void {
  for (let i = 0, len = bindings.length; i < len; i++) {
    const { type, selector, callback } = bindings[i]!;

    $container.on(
      `${type}.atomList`,
      selector,
      function (this: HTMLElement, e: JQuery.TriggeredEvent) {
        const target = (this as HTMLElement).closest?.('[data-atom-key]') as HTMLElement | null;
        if (!target) return;

        const rawKey = target.getAttribute('data-atom-key');
        if (rawKey === null) return;

        const index = getListIndex(ctx, rawKey);
        if (index !== undefined) {
          // Execution: 'this' is the triggered element, first arg is the reactive item.
          callback.call(target, ctx.snapshots[index]!.item, index, e);
        }
      }
    );
  }
}

$.fn.atomList = atomList;
