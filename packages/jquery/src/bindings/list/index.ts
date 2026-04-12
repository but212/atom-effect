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

/**
 * Pool for reusing Map objects to minimize GC pressure during diffing.
 */
const mapPool = new ObjectPool<Map<ListKey, number>>(
  () => new Map(),
  (m) => m.clear()
);

/**
 * Pool for reusing Set objects during diffing.
 */
const setPool = new ObjectPool<Set<ListKey>>(
  () => new Set(),
  (s) => s.clear()
);

/**
 * Pool for reusing arrays during diffing.
 */
const arrayPool = new ArrayPool<unknown>(100, 1024);

const pools = {
  map: mapPool,
  set: setPool,
  array: arrayPool,
};

/**
 * atomList binding for jQuery.
 * Efficiently renders and reconciles a list of items based on an Atom source.
 *
 * @param source - The ReadonlyAtom containing the array of items.
 * @param options - Configuration for rendering, keys, and lifecycle hooks.
 * @returns The original jQuery collection for chaining.
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

  // Each element in the jQuery collection can host a separate list instance.
  for (let cIdx = 0, cLen = this.length; cIdx < cLen; cIdx++) {
    const raw = this[cIdx]!,
      $c = $(raw);

    // Clean up existing instance if any
    $c.off('.atomList');
    const old = listInstances.get(raw);
    if (old) {
      old.fx.dispose();
      old.ctx.dispose();
    }

    const ctx = new ListContext<T>($c, getSelector(raw), options.onRemove);

    // Create a reactive effect that automatically re-runs when 'source' changes
    const fx = effect(() => {
      const items = source.value,
        len = items.length;

      // Reconcilation is performance critical, use untracked to avoid
      // accidental dependencies inside the complex logic.
      untracked(() => {
        // 1. Handle empty state
        handleEmpty(ctx, len, $c, options.empty, arrayPool);
        if (len === 0) return;

        debug.log(LOG_PREFIXES.LIST, `${ctx.containerSelector} updating with ${len} items`);

        // 2. Build diff information (reconciliation)
        const diff = buildIndices(ctx, items, len, getKey, options.update, options.isEqual, pools);

        // 3. Render new items (or update existing ones if strings provided)
        const frag = renderItems(diff, options, ctx.oldKeys.length === 0);

        // 4. Mark removed items for deletion (handles async transitions)
        cleanupRemoved(ctx, diff);

        // 5. Place nodes in the DOM and call lifecycle hooks
        placeItems(ctx, diff, raw, callbacks, frag);

        // Update event mapping if needed
        if (options.events) {
          for (let i = diff.startIndex; i <= diff.oldEndIndex; i++) {
            if (!diff.newKeySet.has(ctx.oldKeys[i]!)) ctx.keyToIndex.delete(ctx.oldKeys[i]!);
          }
        }

        // Release old memory back to pools
        arrayPool.release(ctx.oldKeys);
        arrayPool.release(ctx.oldItems);
        arrayPool.release(ctx.oldNodes as unknown[]);

        // Sync context with new state
        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;

        // Release diff-specific structures
        setPool.release(diff.newKeySet);
        arrayPool.release(diff.trKeys);
        arrayPool.release(diff.trItems);
        arrayPool.release(diff.trIdxs);
      });
    });

    ctx.fx = fx;

    // Event delegation support
    if (options.events) {
      for (const ek in options.events) {
        if (!hasOwn.call(options.events, ek)) continue;
        const s = ek.indexOf(' '),
          type = s === -1 ? ek : ek.slice(0, s),
          sel = s === -1 ? '> *' : ek.slice(s + 1).trim();
        const handler = options.events[ek]!;

        $c.on(`${type}.atomList`, sel, function (this: Element, e: JQuery.TriggeredEvent) {
          // Use data-atom-key to find the corresponding item in the context
          const itemEl = (e.target as Element).closest?.('[data-atom-key]') as HTMLElement | null;
          const rk = itemEl?.getAttribute('data-atom-key');
          if (rk === null || rk === undefined) return;

          let k: ListKey = rk;
          if (!ctx.keyToIndex.has(rk)) {
            const nk = Number(rk); // Try converting to number for key lookup
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
