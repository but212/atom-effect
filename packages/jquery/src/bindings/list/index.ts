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
const listInstances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

/**
 * Binds a reactive atom array to a jQuery container for automated list rendering.
 *
 * When to use:
 * - Use this to render dynamic lists that stay in sync with an atom's value.
 * - Ideal for high-performance dashboard rows, item feeds, or state-driven UI components.
 *
 * Performance:
 * - Uses a diffing algorithm to minimize DOM operations (only moves or updates what's changed).
 * - Implements batch rendering and sanitization for cold starts.
 *
 * @example
 * $('#my-list').atomList(itemAtom, {
 *   key: 'id',
 *   render: (item) => `<li>${item.name}</li>`,
 *   events: {
 *     'click li': (item, index, e) => console.log(item.id)
 *   }
 * });
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
    const raw = this[i]!,
      $c = $(raw);

    // Teardown previous binding if re-applying to the same element
    const old = listInstances.get(raw);
    if (old) {
      old.fx.dispose();
      old.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(raw), options.onRemove);
    const fx = effect(() => {
      const items = source.value,
        count = items.length;

      // Reason: DOM synchronization and diffing should not contribute to
      // reactive dependency tracking to prevent infinite loops or over-execution.
      untracked(() => {
        handleEmpty(ctx, count, $c, options.empty);
        if (count === 0) return;

        const isActuallyInitial = ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0;

        ctx.keyToIndex.clear();
        const diff = buildIndices(ctx, items, count, getKey, options.update, options.isEqual);

        const frag = renderItems(diff, options, isActuallyInitial);

        cleanupRemoved(ctx, diff);
        placeItems(ctx, diff, raw, callbacks, frag);

        // Update context with the new state for the next reconciliation cycle
        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;
      });
    });

    ctx.fx = fx;
    if (options.events) setupEvents(ctx, $c, options.events);

    // Lifecycle: Automatic cleanup when the element or parent effect is destroyed
    registry.trackEffect(raw, fx);
    listInstances.set(raw, { fx, ctx });

    registry.trackCleanup(raw, () => {
      ctx.dispose();
      listInstances.delete(raw);
    });
  }
  return this;
}

/**
 * Configures delegated event listeners on the container.
 *
 * Logic:
 * - Uses event delegation for performance (single listener per container).
 * - Resolves the clicked DOM element back to the original data item using 'data-atom-key'.
 */
function setupEvents<T>(
  ctx: ListContext<T>,
  $container: JQuery,
  events: Record<string, Function>
): void {
  for (const ek in events) {
    if (!hasOwn.call(events, ek)) continue;
    const s = ek.indexOf(' '),
      type = s === -1 ? ek : ek.slice(0, s),
      sel = s === -1 ? '> *' : ek.slice(s + 1).trim();
    const handler = events[ek]!;

    $container.on(`${type}.atomList`, sel, function (this: HTMLElement, e: JQuery.TriggeredEvent) {
      const itemEl = e.target.closest?.('[data-atom-key]') as HTMLElement | null;
      const rk = itemEl?.getAttribute('data-atom-key');
      if (rk === null || rk === undefined) return;

      let key: ListKey = rk;

      // Handle cases where Number-based keys were serialized to Strings in the DOM
      if (!ctx.keyToIndex.has(rk)) {
        const nk = Number(rk);
        if (!Number.isNaN(nk) && ctx.keyToIndex.has(nk)) key = nk;
      }

      const idx = ctx.keyToIndex.get(key);
      if (idx !== undefined) {
        handler.call(itemEl as HTMLElement, ctx.oldItems[idx]!, idx, e);
      }
    });
  }
}

$.fn.atomList = atomList;
