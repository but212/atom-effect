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
import type { ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import {
  createListContext,
  disposeContext,
  type ListContext,
  removeNode,
  resolveEventTarget,
} from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { EventBinding, PlaceCallbacks } from './types';

/**
 * Role: Registry for active list instances.
 *
 * Why: Enables external tools and the core registry to access reactive context
 * without polluting DOM nodes with internal properties.
 */
const instances = new WeakMap<
  Element,
  { reactiveEffect: EffectObject; ctx: ListContext<unknown> }
>();

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
): { reactiveEffect: EffectObject; ctx: ListContext<T> } {
  const { key, update, isEqual, empty, events, onRemove, bind, onAdd } = options;
  const containerElement = $(element);

  // 1. Lifecycle: Enforce single-binding per element by disposing old instances.
  const previousInstance = instances.get(element);
  if (previousInstance) {
    previousInstance.reactiveEffect.dispose();
    disposeContext(previousInstance.ctx);
  } else {
    // Register once per element lifecycle to avoid zombie cleanup accumulation
    registry.onCleanup(element, () => {
      const active = instances.get(element);
      if (active) {
        active.reactiveEffect.dispose();
        disposeContext(active.ctx);
        instances.delete(element);
      }
    });
  }

  // 2. Optimization: Pre-calculate lookup strategies to minimize work inside the effect loop.
  const getKey: ListKeyFn<T> =
    typeof key === 'function'
      ? key
      : (item: T) => {
          const rawValue = item == null ? item : item[key];
          return typeof rawValue === 'string' || typeof rawValue === 'number'
            ? rawValue
            : String(rawValue);
        };
  const callbacks: PlaceCallbacks<T> = { bind, update, onAdd, onRemove, events };
  const eventBindings = normalizeEvents(events);

  const ctx = createListContext<T>(containerElement, onRemove);

  let prevItems: T[] | undefined;

  const reactiveEffect = effect(() => {
    // Accessing .value establishes the reactive dependency.
    const items = source.value;
    const count = items.length;

    untracked(() => {
      if (items === prevItems) return;
      prevItems = items;

      handleEmpty(ctx, count, containerElement, empty);
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

      // Tear down previous snapshots not claimed by any slot in the new diff
      // (e.g. duplicate-key occurrences superseded by fresh renders). Key-based
      // cleanup alone would miss them when the key still exists elsewhere.
      const claimedOldIndices = new Set<number>();
      for (const slot of diff.slots) {
        if (slot && slot.oldIndex !== -1) claimedOldIndices.add(slot.oldIndex);
      }
      for (let i = 0; i < ctx.snapshots.length; i++) {
        const snapshot = ctx.snapshots[i];
        if (snapshot?.node && !claimedOldIndices.has(i) && !ctx.removingKeys.has(snapshot.key)) {
          removeNode(ctx, snapshot.key, snapshot.node);
        }
      }
      cleanupRemoved(ctx);
      placeItems(ctx, diff, element, callbacks, fragment);

      // Snapshot current state for the next O(N) diff cycle.
      ctx.snapshots = [];
      for (const slot of diff.slots) {
        if (slot) {
          ctx.snapshots.push({ key: slot.key, item: slot.item, node: slot.nodes });
        }
      }
    });
  });

  ctx.reactiveEffect = reactiveEffect;

  if (eventBindings.length > 0) {
    setupEvents(ctx, containerElement, eventBindings);
  }

  instances.set(element, { reactiveEffect: reactiveEffect, ctx });

  return { reactiveEffect: reactiveEffect, ctx };
}

/**
 * Synchronizes an element's children with a reactive list source.
 *
 * When to use:
 * - Recommended for rendering dynamic collections with high-performance O(N) updates.
 * - Suitable for lists requiring complex item templates or delegated event handling.
 *
 * @param source The reactive atom containing the array of items.
 * @param options Configuration for rendering, identification, and lifecycle hooks.
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
  for (let i = 0, length = this.length; i < length; i++) {
    const element = this[i];
    if (element) {
      applyListBinding(element, source, options);
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
function normalizeEvents<T>(events: ListOptions<T>['events']): EventBinding<T>[] {
  return Object.entries(events || {}).map(([key, callback]) => {
    const trimmed = key.trim();
    const spaceIndex = trimmed.indexOf(' ');
    const type = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
    const selector = spaceIndex === -1 ? '> *' : trimmed.slice(spaceIndex + 1).trim() || '> *';
    return {
      type,
      selector,
      callback,
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
function setupEvents<T>(
  ctx: ListContext<T>,
  $container: JQuery,
  bindings: EventBinding<T>[]
): void {
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
