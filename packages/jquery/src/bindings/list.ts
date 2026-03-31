import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector, hasOwn, shallowEqual } from '@/utils';
import { ArrayPool } from '@/utils/array-pool';
import { debug } from '@/utils/debug';
import { ObjectPool } from '@/utils/object-pool';
import { sanitizeHtml } from '@/utils/sanitize';

// ============================================================================
// Helpers
// ============================================================================

const listInstances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();
let listBatchIdCounter = 0;

const mapPool = new ObjectPool<Map<ListKey, number>>(
  () => new Map(),
  (m) => m.clear()
);
const setPool = new ObjectPool<Set<ListKey>>(
  () => new Set(),
  (s) => s.clear()
);
const arrayPool = new ArrayPool<unknown>(100, 1024);

function insertOrAppend(elOrJq: Element | JQuery, nextNode: Node | null, container: Element): void {
  // Optimization: insertBefore(node, null) is same as appendChild(node)
  if (elOrJq instanceof Element) {
    container.insertBefore(elOrJq, nextNode);
    return;
  }
  const len = elOrJq.length;
  for (let i = 0; i < len; i++) {
    const el = elOrJq[i];
    if (el) {
      container.insertBefore(el, nextNode);
    }
  }
}

function wrap($el: Element | JQuery<Element>): JQuery {
  return ($el instanceof Element ? $($el) : $el) as unknown as JQuery;
}

// ============================================================================
// ListContext
// ============================================================================

class ListContext<T> {
  oldKeys: ListKey[] = [];
  oldItems: T[] = [];
  oldNodes: (Element | JQuery)[] = [];

  readonly removingKeys = new Set<ListKey>();
  $emptyEl: JQuery | null = null;
  readonly keyToIndex = new Map<ListKey, number>();
  fx?: EffectObject;

  statesBuffer = new Uint8Array(256);
  indicesBuffer = new Int32Array(256);

  constructor(
    public readonly $container: JQuery,
    /** @internal */
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      if (this.fx?.isDisposed) return;
      if ($el[0]?.isConnected) $el.remove();
      this.removingKeys.delete(k);
      if (debug.enabled) debug.log(LOG_PREFIXES.LIST, `${this.containerSelector} removed item:`, k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) res.then(commit, commit);
    else commit();
  }

  removeItem(k: ListKey, $el: JQuery): void {
    for (let j = 0; j < $el.length; j++) {
      if ($el[j] instanceof Element) ($el[j] as Element).removeAttribute('data-atom-key');
    }
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  dispose(): void {
    this.removingKeys.clear();
    this.oldKeys.length = 0;
    this.oldItems.length = 0;
    this.oldNodes.length = 0;
    this.keyToIndex.clear();
    this.$emptyEl?.remove();
    this.$container.off('.atomList');
    this.statesBuffer = new Uint8Array(0);
    this.indicesBuffer = new Int32Array(0);
  }

  ensureBuffers(size: number): void {
    if (this.statesBuffer.length < size) {
      this.statesBuffer = new Uint8Array(Math.max(size, this.statesBuffer.length * 2));
    }
    if (this.indicesBuffer.length < size) {
      this.indicesBuffer = new Int32Array(Math.max(size, this.indicesBuffer.length * 2));
    }
  }
}

// ============================================================================
// Internal diff types
// ============================================================================

interface PreparedDiff<T> {
  newKeys: ListKey[];
  newKeySet: Set<ListKey>;
  newItems: T[];
  newNodes: (Element | JQuery)[];
  newStates: Uint8Array;
  newIndices: Int32Array;
  trKeys: ListKey[];
  trItems: T[];
  trIdxs: number[];
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
}

interface PlaceCallbacks<T> {
  bind: ListOptions<T>['bind'];
  update: ListOptions<T>['update'];
  onAdd: ListOptions<T>['onAdd'];
  onRemove: ListOptions<T>['onRemove'];
  events: ListOptions<T>['events'];
}

// ============================================================================
// Step functions
// ============================================================================

function handleEmpty<T>(
  ctx: ListContext<T>,
  itemCount: number,
  $container: JQuery,
  empty: ListOptions<T>['empty']
): void {
  if (ctx.$emptyEl && itemCount > 0) {
    ctx.$emptyEl.remove();
    ctx.$emptyEl = null;
  }
  if (itemCount !== 0) return;

  const { oldKeys, oldNodes, onRemove } = ctx;
  if (!onRemove) {
    for (let i = 0, len = oldKeys.length; i < len; i++) ctx.removingKeys.delete(oldKeys[i]!);
    $container.empty();
  } else {
    for (let i = 0, len = oldKeys.length; i < len; i++) {
      const k = oldKeys[i]!;
      if (oldNodes[i]) ctx.removeItem(k, wrap(oldNodes[i]!));
    }
  }

  if (empty && !ctx.$emptyEl) {
    ctx.$emptyEl = (typeof empty === 'string'
      ? $(sanitizeHtml(empty))
      : $(empty as Element | JQuery)) as unknown as JQuery;
    ctx.$emptyEl.appendTo($container);
  }

  arrayPool.release(ctx.oldKeys);
  arrayPool.release(ctx.oldItems);
  arrayPool.release(ctx.oldNodes);
  ctx.oldKeys = [];
  ctx.oldItems = [];
  ctx.oldNodes = [];
}

function buildIndices<T>(
  ctx: ListContext<T>,
  items: T[],
  itemCount: number,
  getKey: ListKeyFn<T>,
  update: ListOptions<T>['update'],
  isEqual: ListOptions<T>['isEqual']
): PreparedDiff<T> {
  const { oldKeys, oldItems, oldNodes, removingKeys, keyToIndex } = ctx;
  const oldLen = oldKeys.length;

  let startIndex = 0,
    oldEndIndex = oldLen - 1,
    newEndIndex = itemCount - 1;

  const eq = isEqual || shallowEqual;

  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex]!;
    const k = getKey(item, startIndex);
    if (oldKeys[startIndex] !== k || !eq(oldItems[startIndex]!, item)) {
      break;
    }
    keyToIndex.set(k, startIndex++);
  }

  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex]!;
    const k = getKey(item, newEndIndex);
    if (oldKeys[oldEndIndex] !== k || !eq(oldItems[oldEndIndex]!, item)) {
      break;
    }
    keyToIndex.set(k, newEndIndex--);
    oldEndIndex--;
  }

  const oldIndexMap = mapPool.acquire();
  for (let i = startIndex; i <= oldEndIndex; i++) oldIndexMap.set(oldKeys[i]!, i);

  const newKeySet = setPool.acquire();
  ctx.ensureBuffers(itemCount);

  const newKeys = arrayPool.acquire() as ListKey[];
  newKeys.length = itemCount;
  const newItems = arrayPool.acquire() as T[];
  newItems.length = itemCount;
  const newNodes = arrayPool.acquire() as (Element | JQuery)[];
  newNodes.length = itemCount;
  const newStates = ctx.statesBuffer,
    newIndices = ctx.indicesBuffer;

  const trKeys = arrayPool.acquire() as ListKey[],
    trItems = arrayPool.acquire() as T[],
    trIdxs = arrayPool.acquire() as number[];

  for (let i = 0; i < startIndex; i++) {
    newKeys[i] = oldKeys[i]!;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[i]!;
    newStates[i] = 3;
    newIndices[i] = i;
  }
  for (let j = oldLen - 1, i = itemCount - 1; i > newEndIndex; i--, j--) {
    newKeys[i] = oldKeys[j]!;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[j]!;
    newStates[i] = 3;
    newIndices[i] = j;
  }

  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i]!,
      k = getKey(item, i);
    newKeys[i] = k;
    newItems[i] = item;
    keyToIndex.set(k, i);

    if (newKeySet.has(k)) {
      debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.LIST.DUPLICATE_KEY(k, i, ctx.containerSelector));
      newIndices[i] = -1;
      continue;
    }
    newKeySet.add(k);

    const oldIdx = oldIndexMap.get(k);
    if (oldIdx === undefined) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
      newIndices[i] = -1;
      newStates[i] = 1;
      continue;
    }

    const oldItem = oldItems[oldIdx]!;
    newNodes[i] = oldNodes[oldIdx]!;

    if (
      !update &&
      oldItem !== item &&
      !(isEqual ? isEqual(oldItem, item) : shallowEqual(oldItem, item))
    ) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
      newStates[i] = 2;
    } else {
      newStates[i] = 0;
    }
    newIndices[i] = removingKeys.has(k) ? -1 : oldIdx;
  }

  mapPool.release(oldIndexMap);
  return {
    newKeys,
    newKeySet,
    newItems,
    newNodes,
    newStates,
    newIndices,
    trKeys,
    trItems,
    trIdxs,
    startIndex,
    oldEndIndex,
    newEndIndex,
  };
}

function renderItems<T>(
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { trKeys, trItems, trIdxs, newNodes, newStates } = diff;
  const renderCount = trKeys.length;
  const renderResults: (string | Element | DocumentFragment | JQuery)[] = new Array(renderCount);
  const htmlParts: string[] = [];
  let stringCount = 0;

  for (let t = 0; t < renderCount; t++) {
    const raw = options.render(trItems[t]!, trIdxs[t]!);
    renderResults[t] = raw;
    if (typeof raw === 'string') {
      htmlParts.push(raw);
      stringCount++;
    }
  }

  let sanitized: string[] | null = null;
  if (htmlParts.length > 0) {
    if (htmlParts.length === 1) sanitized = [sanitizeHtml(htmlParts[0]!)];
    else {
      const sep = `<template data-atom-sep="${(listBatchIdCounter++).toString(36)}"></template>`;
      sanitized = sanitizeHtml(htmlParts.join(sep)).split(sep);
    }
  }

  if (
    isInitial &&
    sanitized &&
    stringCount === renderCount &&
    !options.bind &&
    !options.onAdd &&
    !options.onRemove &&
    !options.events
  ) {
    return sanitized;
  }

  let fragIdx = 0;
  for (let t = 0; t < renderCount; t++) {
    const raw = renderResults[t]!;
    const $el = (typeof raw === 'string'
      ? $(sanitized![fragIdx++]!)
      : $(raw as Element | DocumentFragment | JQuery)) as unknown as JQuery;
    const targetIdx = trIdxs[t]!,
      keyStr = String(trKeys[t]!);

    for (let j = 0, elLen = $el.length; j < elLen; j++) {
      const node = $el[j];
      if (node instanceof Element) {
        node.setAttribute('data-atom-key', keyStr);
      }
    }

    if (newStates[targetIdx] === 2 && newNodes[targetIdx]) {
      const node = newNodes[targetIdx]!;
      if (node instanceof Element) {
        registry.cleanupTree(node);
      } else {
        for (let j = 0, nLen = node.length; j < nLen; j++) {
          const el = node[j];
          if (el instanceof Element) registry.cleanupTree(el);
        }
      }
      wrap(node).replaceWith($el);
    }
    newNodes[targetIdx] = $el.length === 1 ? ($el[0] as Element) : $el;
  }
  return null;
}

function cleanupRemoved<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { startIndex, oldEndIndex, newKeySet } = diff;
  for (let i = startIndex; i <= oldEndIndex; i++) {
    const k = ctx.oldKeys[i]!;
    if (!newKeySet.has(k) && ctx.oldNodes[i]) ctx.removeItem(k, wrap(ctx.oldNodes[i]!));
  }
}

function placeItems<T>(
  ctx: ListContext<T>,
  diff: PreparedDiff<T>,
  rawContainer: Element,
  callbacks: PlaceCallbacks<T>,
  innerHtmlFragments: string[] | null
): void {
  const { newKeys, newItems, newNodes, newStates, newIndices } = diff;
  const itemCount = newKeys.length;

  if (innerHtmlFragments !== null) {
    rawContainer.innerHTML = innerHtmlFragments.join('');
    let el = rawContainer.firstElementChild;
    for (let i = 0; i < itemCount; i++) {
      if (!el) break;
      el.setAttribute('data-atom-key', String(newKeys[i]));
      newNodes[i] = el;
      newStates[i] = 0;
      ctx.removingKeys.delete(newKeys[i]!);
      if (debug.enabled)
        debug.domUpdated(LOG_PREFIXES.LIST, $(el) as unknown as JQuery, 'list.add', newItems[i]);
      el = el.nextElementSibling;
    }
    return;
  }

  if (ctx.oldKeys.length === 0) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < itemCount; i++) {
      const node = newNodes[i]!;
      if (node instanceof Element) frag.appendChild(node);
      else for (let j = 0; j < node.length; j++) frag.appendChild(node[j]!);
    }
    rawContainer.appendChild(frag);
  } else {
    let nextNode: Node | null = null,
      min = 2147483647;
    for (let i = itemCount - 1; i >= 0; i--) {
      const idx = newIndices[i]!;
      if (idx !== -1 && idx < min) {
        min = idx;
      } else {
        insertOrAppend(newNodes[i]!, nextNode, rawContainer);
      }
      const node = newNodes[i]!;
      nextNode = node instanceof Element ? node : (node[0] ?? null);
    }
  }

  for (let i = 0; i < itemCount; i++) {
    const state = newStates[i]!;
    if (state !== 3) {
      const $el = wrap(newNodes[i]!),
        item = newItems[i]!;
      if (state === 0) callbacks.update?.($el, item, i);
      else callbacks.bind?.($el, item, i);
      if (state === 1) {
        callbacks.onAdd?.($el);
        ctx.removingKeys.delete(newKeys[i]!);
        if (debug.enabled) debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', item);
      }
    }
  }
}

// ============================================================================
// atomList
// ============================================================================

$.fn.atomList = function <T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
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
        handleEmpty(ctx, len, $c, options.empty);
        if (len === 0) return;
        if (debug.enabled)
          debug.log(LOG_PREFIXES.LIST, `${ctx.containerSelector} updating with ${len} items`);

        const diff = buildIndices(ctx, items, len, getKey, options.update, options.isEqual);
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
        arrayPool.release(ctx.oldNodes);
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
};
