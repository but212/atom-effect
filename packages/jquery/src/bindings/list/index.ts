import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector, hasOwn } from '@/utils';
import { ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { PlaceCallbacks } from './types';

/** Provides metadata storage for container-to-context associations. */
const instances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

/**listInstances
 * Binds a reactive atom array to a jQuery container for automated list rendering.
 *
 * Logic: Orchestrates the synchronization between a reactive data source and
 * the DOM tree. It manages a persistent `ListContext` for diffing, wraps
 * rendering cycles in an `effect`, and ensures automatic teardown via the registry.
 *
 * When to use:
 * - Rendering dynamic, high-performance lists that stay in sync with an atom's state.
 * - Building state-driven UI components like data grids, feeds, or dashboards.
 *
 * Optimization:
 * - Employs a double-ended diffing algorithm to minimize DOM manipulations.
 * - Uses sanitized batch-rendering for optimized cold-start performance.
 *
 * @example
 * ```typescript
 * $('#my-list').atomList(itemsAtom, {
 *   key: 'id',
 *   render: (item) => `<li>${item.name}</li>`,
 *   events: {
 *     'click li': (item, index, e) => console.log(item.id)
 *   }
 * });
 * ```
 *
 * @public
 */
function atomList<T>(this: JQuery, source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  const getKey: ListKeyFn<T> =
    typeof options.key === 'function'
      ? options.key
      : (item: T) => item[options.key as keyof T] as unknown as ListKey;

  const callbacks: PlaceCallbacks<T> = {
    bind: options.bind,
    update: options.update,
    onAdd: options.onAdd,
    onRemove: options.onRemove,
    events: options.events,
  };

  for (let i = 0, len = this.length; i < len; i++) {
    const element = this[i]!,
      $c = $(element);

    const prev = instances.get(element);
    if (prev) {
      prev.fx.dispose();
      prev.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(element), options.onRemove);
    const fx = effect(() => {
      const items = source.value,
        count = items.length;

      // Reason: DOM synchronization and diffing should not contribute to
      // reactive dependency tracking to prevent infinite loops or over-execution.
      untracked(() => {
        handleEmpty(ctx, count, $c, options.empty);
        if (count === 0) return;

        const isInitial = ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0;

        ctx.keyToIndex.clear();
        const diff = buildIndices(ctx, items, count, getKey, options.update, options.isEqual);

        const fragment = renderItems(diff, options, isInitial);

        cleanupRemoved(ctx, diff);
        placeItems(ctx, diff, element, callbacks, fragment);

        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;
      });
    });

    ctx.fx = fx;
    if (options.events) setupEvents(ctx, $c, options.events);

    // Lifecycle: Automatic cleanup when the element or parent effect is destroyed
    registry.trackEffect(element, fx);
    instances.set(element, { fx, ctx });

    registry.onCleanup(element, () => {
      ctx.dispose();
      instances.delete(element);
    });
  }
  return this;
}

/**
 * Configures delegated event listeners on the container.
 *
 * Logic:
 * 1. Efficient Delegation: Attaches a single listener to the container per event type.
 * 2. Data Resolution: Maps clicked elements back to their original data items
 *    using the stable `data-atom-key` identity and the context's lookup map.
 * 3. Type Coercion: Automatically handles serializing/deserializing numeric
 *    keys that become strings when stored in HTML attributes.
 */
function setupEvents<T>(
  ctx: ListContext<T>,
  $container: JQuery,
  events: Record<string, Function>
): void {
  for (const eventKey in events) {
    if (!hasOwn.call(events, eventKey)) continue;
    const spacePos = eventKey.indexOf(' '),
      type = spacePos === -1 ? eventKey : eventKey.slice(0, spacePos),
      selector = spacePos === -1 ? '> *' : eventKey.slice(spacePos + 1).trim();
    const callback = events[eventKey]!;

    $container.on(
      `${type}.atomList`,
      selector,
      function (this: HTMLElement, e: JQuery.TriggeredEvent) {
        const target = e.target.closest?.('[data-atom-key]') as HTMLElement | null;
        const rawKey = target?.getAttribute('data-atom-key');
        if (rawKey === null || rawKey === undefined) return;

        let key: ListKey = rawKey;

        // Handle cases where Number-based keys were serialized to Strings in the DOM
        if (!ctx.keyToIndex.has(rawKey)) {
          const numKey = Number(rawKey);
          if (!Number.isNaN(numKey) && ctx.keyToIndex.has(numKey)) key = numKey;
        }

        const index = ctx.keyToIndex.get(key);
        if (index !== undefined) {
          callback.call(target as HTMLElement, ctx.oldItems[index]!, index, e);
        }
      }
    );
  }
}

$.fn.atomList = atomList;
