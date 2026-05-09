import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector } from '@/utils';
import { ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { PlaceCallbacks } from './types';

/**
 * Internal WeakMap storage used to associate DOM elements with their persistent
 * list contexts and controlling effects.
 */
const instances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

interface EventBinding {
  type: string;
  selector: string;
  callback: Function;
}

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

  const eventBindings: EventBinding[] = options.events
    ? Object.entries(options.events).map(([eventKey, callback]) => {
        const [type, ...selectorParts] = eventKey.trim().split(/\s+/);
        return {
          type: type!,
          selector: selectorParts.length > 0 ? selectorParts.join(' ') : '> *',
          callback: callback!,
        };
      })
    : [];

  for (let i = 0, len = this.length; i < len; i++) {
    const element = this[i]!;
    const $c = $(element);

    const prev = instances.get(element);
    if (prev) {
      prev.fx.dispose();
      prev.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(element), options.onRemove);
    const fx = effect(() => {
      const items = source.value;
      const count = items.length;

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
    if (eventBindings.length > 0) setupEvents(ctx, $c, eventBindings);

    registry.trackEffect(element, fx);
    instances.set(element, { fx, ctx });

    registry.onCleanup(element, () => {
      ctx.dispose();
      instances.delete(element);
    });
  }
  return this;
}

function setupEvents<T>(ctx: ListContext<T>, $container: JQuery, bindings: EventBinding[]): void {
  for (let i = 0, len = bindings.length; i < len; i++) {
    const { type, selector, callback } = bindings[i]!;

    $container.on(
      `${type}.atomList`,
      selector,
      function (this: HTMLElement, e: JQuery.TriggeredEvent) {
        const target = (e.target as HTMLElement).closest?.('[data-atom-key]') as HTMLElement | null;
        if (!target) return;

        const rawKey = target.getAttribute('data-atom-key');
        if (rawKey === null) return;

        const index = ctx.getIndex(rawKey);
        if (index !== undefined) {
          callback.call(target, ctx.oldItems[index]!, index, e);
        }
      }
    );
  }
}

$.fn.atomList = atomList;
