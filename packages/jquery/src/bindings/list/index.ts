/**
 * @module List Binding
 *
 * Responsibility:
 * Provides high-performance reactive list rendering and reconciliation for
 * jQuery collections, supporting complex data models and delegated events.
 *
 * Design Intent:
 * Orchestrates a specialized rendering pipeline (Diff -> Render -> Place)
 * while maintaining memory safety via automated lifecycle cleanup.
 */

import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector } from '@/utils';
import { ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { EventBinding, PlaceCallbacks } from './types';

/**
 * Role: Registry for active list instances.
 *
 * Why: Enables external tools and the core registry to access reactive context
 * without polluting DOM nodes with internal properties.
 */
const instances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

/**
 * Role: List Reconciliation Engine
 * Orchestrates the full lifecycle: Empty state -> Diffing -> Rendering -> DOM placement.
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
    prev.ctx.dispose();
  }

  // 2. Optimization: Pre-calculate lookup strategies to minimize work inside the effect loop.
  const getKey: ListKeyFn<T> =
    typeof key === 'function' ? key : (item: T) => item[key as keyof T] as unknown as ListKey;
  const callbacks: PlaceCallbacks<T> = { bind, update, onAdd, onRemove, events };
  const eventBindings = normalizeEvents(events);

  const ctx = new ListContext<T>($c, getSelector(element), onRemove);

  const fx = effect(() => {
    // Accessing .value establishes the reactive dependency.
    const items = source.value;
    const count = items.length;

    untracked(() => {
      handleEmpty(ctx, count, $c, empty);
      if (count === 0) return;

      const isInitial = ctx.snapshots.length === 0 && ctx.removingKeys.size === 0;

      // Pipeline: Diff -> Render -> Cleanup -> Place
      const diff = buildIndices(
        ctx.snapshots,
        ctx.removingKeys,
        ctx.keyToIndex,
        items,
        count,
        getKey,
        update,
        isEqual
      );
      ctx.keyToIndex = diff.keyToIndex;

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

  instances.set(element, { fx, ctx });
  registry.trackEffect(element, fx);
  registry.onCleanup(element, () => {
    ctx.dispose();
    instances.delete(element);
  });

  return { fx, ctx };
}

/**
 * Synchronizes an element's children with a reactive list source.
 *
 * When to use:
 * - Recommended for rendering dynamic collections with high-performance O(N) updates.
 * - Suitable for lists requiring complex item templates or delegated event handling.
 *
 * @param source - The reactive atom containing the array of items.
 * @param options - Configuration for rendering, identification, and lifecycle hooks.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('#todo-list').atomList(todosAtom, {
 *   key: 'id',
 *   render: (todo) => `<li class="item">${todo.text}</li>`,
 *   events: {
 *     'click .remove': (todo, index, e) => removeTodo(todo.id)
 *   }
 * });
 * ```
 */
function atomList<T>(this: JQuery, source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    applyListBinding(this[i]!, source, options);
  }
  return this;
}

/**
 * Logic: Event Normalization
 * Standardizes event strings into efficient binding tables.
 *
 * Optimization: Memory Pressure Reduction
 * Uses manual string slicing instead of Regex to minimize memory allocations
 * in the hot path of binding initialization.
 *
 * @internal
 */
function normalizeEvents<T>(events: ListOptions<T>['events']): EventBinding[] {
  return Object.entries(events || {}).map(([eventKey, callback]) => {
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

    return { type, selector, callback: callback as Function };
  });
}

/**
 * Logic: Delegated Event Mapping
 * Implements efficient event listeners for list items via delegation.
 *
 * Optimization: Key-to-Snapshot Mapping
 * Uses `closest('[data-atom-key]')` to resolve the relevant item and maps it
 * back to the source data via O(1) context lookups.
 *
 * @internal
 */
function setupEvents<T>(ctx: ListContext<T>, $container: JQuery, bindings: EventBinding[]): void {
  const containerEl = $container[0];
  if (!containerEl || containerEl.nodeType !== 1) return;

  for (let i = 0, len = bindings.length; i < len; i++) {
    const { type, selector, callback } = bindings[i]!;

    $container.on(
      `${type}.atomList`,
      selector,
      function (this: HTMLElement, e: JQuery.TriggeredEvent) {
        const resolved = ctx.resolveEventTarget(this, containerEl);
        if (resolved) {
          callback.call(resolved.target, resolved.item, resolved.index, e);
        }
      }
    );
  }
}

$.fn.atomList = atomList;
