import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector, hasOwn } from '@/utils';
import { ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { PlaceCallbacks } from './types';

const listInstances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

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

    const old = listInstances.get(raw);
    if (old) {
      old.fx.dispose();
      old.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(raw), options.onRemove);
    const fx = effect(() => {
      const items = source.value,
        count = items.length;

      untracked(() => {
        handleEmpty(ctx, count, $c, options.empty);
        if (count === 0) return;

        const isActuallyInitial = ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0;

        const diff = buildIndices(ctx, items, count, getKey, options.update, options.isEqual);

        const frag = renderItems(diff, options, isActuallyInitial);

        cleanupRemoved(ctx, diff);
        placeItems(ctx, diff, raw, callbacks, frag);

        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;
      });
    });

    ctx.fx = fx;
    if (options.events) setupEvents(ctx, $c, options.events);

    registry.trackEffect(raw, fx);
    listInstances.set(raw, { fx, ctx });

    registry.trackCleanup(raw, () => {
      ctx.dispose();
      listInstances.delete(raw);
    });
  }
  return this;
}

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
