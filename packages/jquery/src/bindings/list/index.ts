import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector, hasOwn } from '@/utils';
import { ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { PlaceCallbacks } from './types';

/**
 * Internal WeakMap storage used to associate DOM elements with their persistent
 * list contexts and controlling effects.
 */
const instances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

/**
 * Synchronizes a reactive atom array with a jQuery container for automated list rendering.
 *
 * This function establishes a reactive connection between a data source and the
 * DOM tree. It utilizes a persistent `ListContext` to track state across updates
 * and wraps the reconciliation logic within a reactive effect to ensure the
 * view automatically stays in sync with the data.
 *
 * When to use:
 * - To render dynamic lists that require high-performance updates and reordering.
 * - To implement state-driven UI components such as data grids, dashboards, or real-time feeds.
 *
 * Optimization:
 * - Employs a double-ended diffing algorithm to minimize DOM mutations during list updates.
 * - Supports sanitized batch-rendering for optimized initial renders (cold starts).
 *
 * @param source - The reactive atom containing the array of items.
 * @param options - Configuration options for item keys, rendering, and lifecycle hooks.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * import { atom } from '@but212/atom-effect';
 *
 * const items = atom([{ id: 1, text: 'A' }, { id: 2, text: 'B' }]);
 *
 * $('#list').atomList(items, {
 *   key: 'id',
 *   render: (item) => `<li>${item.text}</li>`,
 *   events: {
 *     'click li': (item) => console.log('Clicked:', item.text)
 *   }
 * });
 * ```
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
    const element = this[i]!;
    const $c = $(element);

    // Lifecycle: Dispose of existing instances to prevent memory leaks and conflicting effects.
    const prev = instances.get(element);
    if (prev) {
      prev.fx.dispose();
      prev.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(element), options.onRemove);
    const fx = effect(() => {
      const items = source.value;
      const count = items.length;

      // Reason: Reconciliation and diffing logic is executed within an `untracked`
      // block to prevent the engine from recording internal DOM state management
      // as reactive dependencies, which avoids infinite loops.
      untracked(() => {
        handleEmpty(ctx, count, $c, options.empty);
        if (count === 0) return;

        const isInitial = ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0;

        ctx.keyToIndex.clear();
        const diff = buildIndices(ctx, items, count, getKey, options.update, options.isEqual);

        const fragment = renderItems(diff, options, isInitial);

        cleanupRemoved(ctx, diff);
        placeItems(ctx, diff, element, callbacks, fragment);

        // Logic: Commit the new state to the persistent context for the next diffing cycle.
        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;
      });
    });

    ctx.fx = fx;
    if (options.events) setupEvents(ctx, $c, options.events);

    // Lifecycle: Register the effect and context for automatic cleanup when the DOM node is removed.
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
 * Attaches delegated event listeners to the container based on user-provided configurations.
 *
 * Logic:
 * 1. Delegation: Efficiently attaches a single listener to the container per event type.
 * 2. Resolution: Maps the event target back to the corresponding data item using the
 *    stable `data-atom-key` attribute and the context's lookup map.
 * 3. Coercion: Automatically handles the resolution of numeric keys that may have
 *    been serialized to strings when stored in HTML attributes.
 *
 * @param ctx - The list context for item lookup.
 * @param $container - The jQuery-wrapped container element.
 * @param events - A record of event selectors and their associated callback functions.
 * @internal
 */
function setupEvents<T>(
  ctx: ListContext<T>,
  $container: JQuery,
  events: Record<string, Function>
): void {
  for (const eventKey in events) {
    if (!hasOwn.call(events, eventKey)) continue;
    const spacePos = eventKey.indexOf(' ');
    const type = spacePos === -1 ? eventKey : eventKey.slice(0, spacePos);
    const selector = spacePos === -1 ? '> *' : eventKey.slice(spacePos + 1).trim();
    const callback = events[eventKey]!;

    $container.on(
      `${type}.atomList`,
      selector,
      function (this: HTMLElement, e: JQuery.TriggeredEvent) {
        const target = e.target.closest?.('[data-atom-key]') as HTMLElement | null;
        const rawKey = target?.getAttribute('data-atom-key');
        if (rawKey === null || rawKey === undefined) return;

        let key: ListKey = rawKey;

        // Reason: Numeric keys are serialized to strings in the DOM. This check
        // ensures that the correct typed key is used for index resolution.
        if (!ctx.keyToIndex.has(rawKey)) {
          const numKey = Number(rawKey);
          if (!Number.isNaN(numKey) && ctx.keyToIndex.has(numKey)) {
            key = numKey;
          }
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
