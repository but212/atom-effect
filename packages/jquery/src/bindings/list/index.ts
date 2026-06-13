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

import { type EffectObject, effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { createListContext, disposeContext, type ListContext, resolveEventTarget } from './context';
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
    disposeContext(prev.ctx);
  } else {
    // Register once per element lifecycle to avoid zombie cleanup accumulation
    registry.onCleanup(element, () => {
      const active = instances.get(element);
      if (active) {
        active.fx.dispose();
        disposeContext(active.ctx);
        instances.delete(element);
      }
    });
  }

  // 2. Optimization: Pre-calculate lookup strategies to minimize work inside the effect loop.
  const getKey: ListKeyFn<T> =
    typeof key === 'function' ? key : (item: T) => item[key as keyof T] as ListKey;
  const callbacks: PlaceCallbacks<T> = { bind, update, onAdd, onRemove, events };
  const eventBindings = normalizeEvents(events);

  const ctx = createListContext<T>($c, onRemove);

  let prevItems: T[] | undefined;

  const fx = effect(() => {
    // Accessing .value establishes the reactive dependency.
    const items = source.value;
    const count = items.length;

    untracked(() => {
      if (items === prevItems) return;
      prevItems = items;

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
      ctx.snapshots = [];
      for (const slot of diff.slots) {
        if (slot) {
          ctx.snapshots.push({ key: slot.key, item: slot.item, node: slot.node });
        }
      }
    });
  });

  ctx.fx = fx;

  if (eventBindings.length > 0) {
    setupEvents(ctx, $c, eventBindings);
  }

  instances.set(element, { fx, ctx });

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
    const el = this[i];
    if (el) {
      applyListBinding(el, source, options);
    }
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
  return Object.entries(events || {}).map(([key, callback]) => {
    const trimmed = key.trim();
    const spaceIdx = trimmed.indexOf(' ');
    const type = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const selector = spaceIdx === -1 ? '> *' : trimmed.slice(spaceIdx + 1).trim() || '> *';
    return {
      type,
      selector,
      callback: callback as (
        this: unknown,
        item: unknown,
        index: number,
        e: JQuery.TriggeredEvent
      ) => void,
    };
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
  if (containerEl?.nodeType !== 1) return;

  for (const { type, selector, callback } of bindings) {
    $container.on(
      `${type}.atomList`,
      selector,
      function (this: HTMLElement, e: JQuery.TriggeredEvent) {
        const resolved = resolveEventTarget(ctx, this, containerEl);
        if (resolved) {
          callback.call(resolved.target, resolved.item, resolved.index, e);
        }
      }
    );
  }
}

$.fn.atomList = atomList;
