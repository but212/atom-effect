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

// Pools for avoiding GC pressure during buildIndices
const mapPool = new ObjectPool<Map<ListKey, number>>(
  () => new Map(),
  (m) => m.clear()
);
const setPool = new ObjectPool<Set<ListKey>>(
  () => new Set(),
  (s) => s.clear()
);
const arrayPool = new ArrayPool<unknown>(100, 1024);

function insertOrAppend($el: JQuery, nextNode: Node | null, $container: JQuery): void {
  if (nextNode?.isConnected) $el.insertBefore(nextNode);
  else $el.appendTo($container);
}

// ============================================================================
// ListContext
// ============================================================================

class ListContext<T> {
  oldKeys: ListKey[] = [];
  oldItems: T[] = [];
  oldNodes: JQuery[] = [];

  readonly removingKeys = new Set<ListKey>();
  $emptyEl: JQuery | null = null;
  readonly keyToIndex = new Map<ListKey, number>();
  fx?: EffectObject;

  // Recycled buffers
  statesBuffer = new Uint8Array(256);
  indicesBuffer = new Int32Array(256);

  constructor(
    public readonly $container: JQuery,
    /** @internal */
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commitRemoval = () => {
      if (this.fx?.isDisposed) return;
      $el.remove();
      this.removingKeys.delete(k);
      debug.log(LOG_PREFIXES.LIST, `${this.containerSelector} removed item:`, k);
    };
    if (!this.onRemove) {
      commitRemoval();
      return;
    }
    const result = this.onRemove($el);
    if (result instanceof Promise) {
      result.then(commitRemoval, commitRemoval);
    } else {
      commitRemoval();
    }
  }

  removeItem(k: ListKey, $el: JQuery): void {
    for (let j = 0; j < $el.length; j++) {
      const el = $el[j];
      if (el instanceof HTMLElement) {
        el.removeAttribute('data-atom-key');
      }
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

    // Help GC
    const emptyUint = new Uint8Array(0);
    const emptyInt = new Int32Array(0);
    this.statesBuffer = emptyUint;
    this.indicesBuffer = emptyInt;
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
  newNodes: JQuery[];
  newStates: Uint8Array;
  newIndices: Int32Array;
  trKeys: ListKey[];
  trItems: T[];
  trIdxs: number[];

  // Trim hints
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
    // Fast path: bulk remove
    for (let i = 0, len = oldKeys.length; i < len; i++) {
      const k = oldKeys[i]!;
      const $el = oldNodes[i];
      if ($el) {
        for (let j = 0; j < $el.length; j++) {
          const el = $el[j];
          if (el instanceof HTMLElement) el.removeAttribute('data-atom-key');
        }
      }
      ctx.removingKeys.delete(k);
    }
    $container.empty();
  } else {
    for (let i = 0, len = oldKeys.length; i < len; i++) {
      const k = oldKeys[i]!;
      const $el = oldNodes[i];
      if ($el) ctx.removeItem(k, $el);
    }
  }

  if (empty && !ctx.$emptyEl) {
    const safeEmpty = typeof empty === 'string' ? sanitizeHtml(empty) : empty;
    ctx.$emptyEl = ($(safeEmpty as string) as JQuery).appendTo($container);
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
  const { oldKeys, oldItems, oldNodes, removingKeys } = ctx;
  const oldLen = oldKeys.length;

  // 1. Prefix/Suffix Trimming (Fast-path)
  let startIndex = 0;
  let oldEndIndex = oldLen - 1;
  let newEndIndex = itemCount - 1;

  // Skip common prefix
  while (startIndex <= oldEndIndex && startIndex <= newEndIndex) {
    const item = items[startIndex]!;
    const k = getKey(item, startIndex);
    if (oldKeys[startIndex] !== k) break;

    // Must also check for equality to skip update
    const oldItem = oldItems[startIndex]!;
    const isSame = isEqual ? isEqual(oldItem, item) : shallowEqual(oldItem, item);
    if (!isSame) break;

    startIndex++;
  }

  // Skip common suffix
  while (oldEndIndex >= startIndex && newEndIndex >= startIndex) {
    const item = items[newEndIndex]!;
    const k = getKey(item, newEndIndex);
    if (oldKeys[oldEndIndex] !== k) break;

    const oldItem = oldItems[oldEndIndex]!;
    const isSame = isEqual ? isEqual(oldItem, item) : shallowEqual(oldItem, item);
    if (!isSame) break;

    oldEndIndex--;
    newEndIndex--;
  }

  // 2. Allocation & Pooling
  const oldIndexMap = mapPool.acquire();
  for (let i = startIndex; i <= oldEndIndex; i++) {
    oldIndexMap.set(oldKeys[i]!, i);
  }

  const newKeys = arrayPool.acquire() as ListKey[];
  newKeys.length = itemCount;

  const newKeySet = setPool.acquire();
  ctx.ensureBuffers(itemCount);

  const newItems = arrayPool.acquire() as T[];
  newItems.length = itemCount;

  const newNodes = arrayPool.acquire() as JQuery[];
  newNodes.length = itemCount;

  const newStates = ctx.statesBuffer; // 0=idle, 1=new, 2=replaced
  const newIndices = ctx.indicesBuffer;

  const trKeys = arrayPool.acquire() as ListKey[];
  const trItems = arrayPool.acquire() as T[];
  const trIdxs = arrayPool.acquire() as number[];

  // 3. Process Trimmed Zones
  // Prefix
  for (let i = 0; i < startIndex; i++) {
    newKeys[i] = oldKeys[i]!;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[i]!;
    newStates[i] = 3; // 3=trimmed (fast skip)
    newIndices[i] = i;
  }
  // Suffix
  for (let j = oldLen - 1, i = itemCount - 1; i > newEndIndex; i--, j--) {
    newKeys[i] = oldKeys[j]!;
    newItems[i] = items[i]!;
    newNodes[i] = oldNodes[j]!;
    newStates[i] = 3; // 3=trimmed (fast skip)
    newIndices[i] = j;
  }

  // 4. Process Middle Zone (Diffing)
  for (let i = startIndex; i <= newEndIndex; i++) {
    const item = items[i]!;
    const k = getKey(item, i);
    newKeys[i] = k;
    newItems[i] = item;

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

    const isSame = isEqual ? isEqual(oldItem, item) : shallowEqual(oldItem, item);
    if (!update && oldItem !== item && !isSame) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
      newStates[i] = 2;
    } else {
      newStates[i] = 0;
    }
    newIndices[i] = removingKeys.has(k) ? -1 : oldIdx;
  }

  // Clean up pools
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
  const render = options.render;

  const renderResults: Array<string | Element | DocumentFragment | JQuery> = new Array(renderCount);
  const htmlParts: string[] = [];
  let stringRenderCount = 0;

  for (let t = 0; t < renderCount; t++) {
    const raw = render(trItems[t]!, trIdxs[t]!);
    renderResults[t] = raw;
    if (typeof raw === 'string') {
      htmlParts.push(raw);
      stringRenderCount++;
    }
  }

  let sanitizedFragments: string[] | null = null;
  const htmlPartCount = htmlParts.length;
  if (htmlPartCount > 0) {
    if (htmlPartCount === 1) {
      sanitizedFragments = [sanitizeHtml(htmlParts[0]!)];
    } else {
      const batchId = (listBatchIdCounter++).toString(36);
      const batchSeparator = `<template data-atom-sep="${batchId}"></template>`;
      sanitizedFragments = sanitizeHtml(htmlParts.join(batchSeparator)).split(batchSeparator);
    }
  }

  const useInnerHtml =
    isInitial &&
    sanitizedFragments &&
    stringRenderCount === renderCount &&
    !options.bind &&
    !options.onAdd &&
    !options.onRemove &&
    !options.events;

  if (useInnerHtml) {
    return sanitizedFragments;
  }

  let fragIdx = 0;
  for (let t = 0; t < renderCount; t++) {
    const raw = renderResults[t]!;
    const $el =
      typeof raw === 'string' ? $(sanitizedFragments![fragIdx++]!) : ($(raw as never) as JQuery);

    const targetIdx = trIdxs[t]!;
    const state = newStates[targetIdx]!;
    const key = trKeys[t]!;

    // Attach key for efficient event delegation
    for (let j = 0; j < $el.length; j++) {
      const node = $el[j];
      if (node instanceof HTMLElement) {
        node.setAttribute('data-atom-key', String(key));
      }
    }

    if (state === 2) {
      const oldEl = newNodes[targetIdx]![0];
      if (oldEl) registry.cleanupTree(oldEl);
      newNodes[targetIdx]!.replaceWith($el);
    }

    newNodes[targetIdx] = $el;
  }

  return null;
}

function cleanupRemoved<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { startIndex, oldEndIndex, newKeySet } = diff;
  const { oldKeys, oldNodes } = ctx;

  // Prefix and Suffix are structural matches, no need to check them for removal.
  for (let i = startIndex; i <= oldEndIndex; i++) {
    const k = oldKeys[i]!;
    if (newKeySet.has(k)) continue;

    const $el = oldNodes[i];
    if ($el) ctx.removeItem(k, $el);
  }
}

function placeItems<T>(
  ctx: ListContext<T>,
  diff: PreparedDiff<T>,
  rawContainer: Element,
  $container: JQuery,
  callbacks: PlaceCallbacks<T>,
  innerHtmlFragments: string[] | null
): void {
  const { bind, update, onAdd } = callbacks;
  const { newKeys, newItems, newNodes, newStates, newIndices } = diff;
  const itemCount = newKeys.length;
  const isInitial = ctx.oldKeys.length === 0;

  if (innerHtmlFragments !== null) {
    // ── Initial render: innerHtml fast path ──────────────
    rawContainer.innerHTML = innerHtmlFragments.join('');

    let childIdx = 0;
    for (let i = 0; i < itemCount; i++) {
      const el = rawContainer.children[childIdx++] as HTMLElement | undefined;
      if (el) {
        const $el = $(el);
        const k = newKeys[i]!;
        el.setAttribute('data-atom-key', String(k)); // Ensure key exists on fast path
        newNodes[i] = $el;
        newStates[i] = 0;
        ctx.removingKeys.delete(k);
        if (debug.enabled) debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', newItems[i]);
      }
    }
    return;
  }

  if (isInitial) {
    // ── Initial render: accumulate into DocumentFragment ──────────────
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < itemCount; i++) {
      const $el = newNodes[i];
      if (!$el) continue;
      for (let j = 0; j < $el.length; j++) {
        fragment.appendChild($el[j]!);
      }
    }
    rawContainer.appendChild(fragment);
  } else {
    let nextNode: Node | null = null;
    let minOldIndexSeen = 2147483647; // Max Int32

    for (let i = itemCount - 1; i >= 0; i--) {
      const oldIndex = newIndices[i]!;
      const $el = newNodes[i];
      if (!$el) continue;

      if (oldIndex !== -1 && oldIndex < minOldIndexSeen) {
        minOldIndexSeen = oldIndex;
      } else {
        insertOrAppend($el, nextNode, $container);
      }
      nextNode = $el[0] ?? null;
    }
  }

  // ── Post-DOM insertion: apply callbacks ───────────────────────────
  for (let i = 0; i < itemCount; i++) {
    const $el = newNodes[i];
    if (!$el?.[0]) continue;

    const state = newStates[i]!;
    if (state !== 3) {
      const item = newItems[i]!;
      if (state === 0) {
        update?.($el, item, i);
      } else {
        bind?.($el, item, i);
      }
    }

    if (state === 1) {
      onAdd?.($el);
      const k = newKeys[i]!;
      ctx.removingKeys.delete(k);
      if (debug.enabled) debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', newItems[i]);
    }
  }
}

function syncEventIndices<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { newKeys, newKeySet, startIndex, oldEndIndex } = diff;
  const itemCount = newKeys.length;
  const { keyToIndex } = ctx;

  // 1. Remove deleted keys from middle section
  for (let i = startIndex; i <= oldEndIndex; i++) {
    const k = ctx.oldKeys[i]!;
    if (!newKeySet.has(k)) {
      keyToIndex.delete(k);
    }
  }
  // 2. Refresh middle and suffix indices. Prefix indices are unchanged.
  for (let i = startIndex; i < itemCount; i++) {
    const k = newKeys[i]!;
    keyToIndex.set(k, i);
  }
}

// ============================================================================
// atomList
// ============================================================================

$.fn.atomList = function <T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  const { key, bind, update, onAdd, onRemove, empty, events, isEqual } = options;

  const getKey: ListKeyFn<T> =
    typeof key === 'function'
      ? key
      : (item: T, _index: number) => item[key as keyof T] as unknown as ListKey;

  const callbacks: PlaceCallbacks<T> = { bind, update, onAdd, onRemove, events };

  for (
    let containerIdx = 0, containerLen = this.length;
    containerIdx < containerLen;
    containerIdx++
  ) {
    const rawContainer = this[containerIdx]!;
    const $container = $(rawContainer);

    $container.off('.atomList');
    const oldInstance = listInstances.get(rawContainer);
    if (oldInstance) {
      oldInstance.fx.dispose();
      oldInstance.ctx.dispose();
    }

    const containerSelector = getSelector(rawContainer);
    const ctx = new ListContext<T>($container, containerSelector, onRemove);

    const fx = effect(() => {
      const items = source.value;
      const itemCount = items.length;

      untracked(() => {
        handleEmpty(ctx, itemCount, $container, empty);
        if (itemCount === 0) return;

        debug.log(LOG_PREFIXES.LIST, `${containerSelector} updating with ${itemCount} items`);

        const diff = buildIndices(ctx, items, itemCount, getKey, update, isEqual);
        const isInitial = ctx.oldKeys.length === 0;

        const innerHtmlFragments = renderItems(diff, options, isInitial);
        cleanupRemoved(ctx, diff);
        placeItems(ctx, diff, rawContainer, $container, callbacks, innerHtmlFragments);

        if (events) syncEventIndices(ctx, diff);

        // Recycle old arrays
        arrayPool.release(ctx.oldKeys);
        arrayPool.release(ctx.oldItems);
        arrayPool.release(ctx.oldNodes);

        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;

        // Release temporary diff resources
        setPool.release(diff.newKeySet);
        arrayPool.release(diff.trKeys);
        arrayPool.release(diff.trItems);
        arrayPool.release(diff.trIdxs);
      });
    });

    ctx.fx = fx;

    if (events) {
      for (const eventKey in events) {
        if (!hasOwn.call(events, eventKey)) continue;
        const handler = events[eventKey]!;

        const spaceIdx = eventKey.indexOf(' ');
        const eventType = spaceIdx === -1 ? eventKey : eventKey.slice(0, spaceIdx);
        const childSelector = spaceIdx === -1 ? null : eventKey.slice(spaceIdx + 1).trim();
        const actualSelector = childSelector ? childSelector : '> *';

        const delegateHandler = function (this: Element, e: JQuery.TriggeredEvent) {
          const itemEl = (e.target as Element).closest?.('[data-atom-key]') as HTMLElement | null;
          if (!itemEl) return;

          const rawKey = itemEl.getAttribute('data-atom-key');
          if (rawKey === null) return;

          // Convert back to number if it was number (ListKey can be string | number)
          let key: ListKey = rawKey;
          if (!ctx.keyToIndex.has(rawKey)) {
            const numKey = Number(rawKey);
            if (!Number.isNaN(numKey) && ctx.keyToIndex.has(numKey)) {
              key = numKey;
            }
          }

          const idx = ctx.keyToIndex.get(key);
          if (idx !== undefined) {
            handler.call(itemEl as HTMLElement, ctx.oldItems[idx]!, idx, e);
          }
        };

        $container.on(`${eventType}.atomList`, actualSelector, delegateHandler);
      }
    }

    registry.trackEffect(rawContainer, fx);
    listInstances.set(rawContainer, { fx, ctx });
    registry.trackCleanup(rawContainer, () => {
      ctx.dispose();
      listInstances.delete(rawContainer);
    });
  }

  return this;
};
