import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector, hasOwn } from '@/utils';
import { debug } from '@/utils/debug';
import { ArrayPool, ObjectPool } from '@/utils/pool';
import { ListContext } from './context';
import { buildIndices } from './diff';
import { cleanupRemoved, handleEmpty, placeItems, renderItems } from './dom';
import type { PlaceCallbacks } from './types';

const listInstances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();

const mapPool = new ObjectPool<Map<ListKey, number>>(
  () => new Map(),
  (m) => m.clear()
);
const setPool = new ObjectPool<Set<ListKey>>(
  () => new Set(),
  (s) => s.clear()
);
const arrayPool = new ArrayPool<unknown>(100, 1024);

const pools = {
  map: mapPool,
  set: setPool,
  array: arrayPool,
};

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

  for (let cIdx = 0, cLen = this.length; cIdx < cLen; cIdx++) {
    const raw = this[cIdx]!,
      $c = $(raw);

    $c.off('.atomList');
    const old = listInstances.get(raw);
    if (old) {
      old.fx.dispose();
      old.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(raw), options.onRemove);
    const fx = effect(() => {
      const items = source.value,
        len = items.length;

      untracked(() => {
        handleEmpty(ctx, len, $c, options.empty, arrayPool);
        if (len === 0) return;
        debug.log(LOG_PREFIXES.LIST, `${ctx.containerSelector} updating with ${len} items`);

        const diff = buildIndices(ctx, items, len, getKey, options.update, options.isEqual, pools);
        const frag = renderItems(diff, options, ctx.oldKeys.length === 0);
        cleanupRemoved(ctx, diff);
        placeItems(ctx, diff, raw, callbacks, frag);

        if (options.events) {
          for (let i = diff.startIndex; i <= diff.oldEndIndex; i++) {
            if (!diff.newKeySet.has(ctx.oldKeys[i]!)) ctx.keyToIndex.delete(ctx.oldKeys[i]!);
          }
        }

        arrayPool.release(ctx.oldKeys);
        arrayPool.release(ctx.oldItems);
        arrayPool.release(ctx.oldNodes as unknown[]);

        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;

        setPool.release(diff.newKeySet);
        arrayPool.release(diff.trKeys);
        arrayPool.release(diff.trItems);
        arrayPool.release(diff.trIdxs);
      });
    });

    ctx.fx = fx;

    if (options.events) {
      for (const ek in options.events) {
        if (!hasOwn.call(options.events, ek)) continue;
        const s = ek.indexOf(' '),
          type = s === -1 ? ek : ek.slice(0, s),
          sel = s === -1 ? '> *' : ek.slice(s + 1).trim();
        const handler = options.events[ek]!;

        $c.on(`${type}.atomList`, sel, function (this: Element, e: JQuery.TriggeredEvent) {
          const itemEl = (e.target as Element).closest?.('[data-atom-key]') as HTMLElement | null;
          const rk = itemEl?.getAttribute('data-atom-key');
          if (rk === null || rk === undefined) return;

          let k: ListKey = rk;
          if (!ctx.keyToIndex.has(rk)) {
            const nk = Number(rk);
            if (!Number.isNaN(nk) && ctx.keyToIndex.has(nk)) k = nk;
          }
          const idx = ctx.keyToIndex.get(k);
          if (idx !== undefined) handler.call(itemEl as HTMLElement, ctx.oldItems[idx]!, idx, e);
        });
      }
    }

    registry.trackEffect(raw, fx);
    listInstances.set(raw, { fx, ctx });
    registry.trackCleanup(raw, () => {
      ctx.dispose();
      listInstances.delete(raw);
    });
  }
  return this;
}

$.fn.atomList = atomList;
