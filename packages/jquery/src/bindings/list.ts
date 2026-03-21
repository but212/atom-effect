import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { EffectObject, ListKey, ListKeyFn, ListOptions, ReadonlyAtom } from '@/types';
import { getSelector, hasOwn, shallowEqual } from '@/utils';
import { debug } from '@/utils/debug';
import { sanitizeHtml } from '@/utils/sanitize';

// ============================================================================
// Helpers
// ============================================================================

const listInstances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();
let listBatchIdCounter = 0;

function insertOrAppend($el: JQuery, nextNode: Node | null, $container: JQuery): void {
  if (nextNode?.isConnected) $el.insertBefore(nextNode);
  else $el.appendTo($container);
}

function applyItemCallbacks<T>(
  state: number,
  $el: JQuery,
  item: T,
  index: number,
  bind: ListOptions<T>['bind'],
  update: ListOptions<T>['update']
): void {
  if (!$el[0]) return;
  if (state === 0) {
    if (update) update($el, item, index);
  } else if (bind) {
    bind($el, item, index);
  }
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
  readonly elToKey = new WeakMap<Element, ListKey>();
  readonly keyToIndex = new Map<ListKey, number>();
  fx?: EffectObject;

  constructor(
    public readonly $container: JQuery,
    /** @internal */
    public readonly containerSelector: string,
    private readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
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
      if (el) this.elToKey.delete(el);
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

  if (empty && !ctx.$emptyEl) {
    const safeEmpty = typeof empty === 'string' ? sanitizeHtml(empty) : empty;
    ctx.$emptyEl = ($(safeEmpty as string) as JQuery).appendTo($container);
  }

  const { oldKeys, oldNodes } = ctx;
  for (let i = 0, len = oldKeys.length; i < len; i++) {
    const k = oldKeys[i]!;
    const $el = oldNodes[i];
    if ($el) ctx.removeItem(k, $el);
  }
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
  const oldIndexMap = new Map<ListKey, number>();
  for (let i = 0, len = oldKeys.length; i < len; i++) {
    oldIndexMap.set(oldKeys[i]!, i);
  }

  const newKeys: ListKey[] = new Array(itemCount);
  const newKeySet = new Set<ListKey>();
  const newIndices = new Int32Array(itemCount);

  const newItems: T[] = new Array(itemCount);
  const newNodes: JQuery[] = new Array(itemCount);
  const newStates = new Uint8Array(itemCount); // 0=idle, 1=new, 2=replaced

  const trKeys: ListKey[] = [];
  const trItems: T[] = [];
  const trIdxs: number[] = [];

  for (let i = 0; i < itemCount; i++) {
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
    }
    newIndices[i] = removingKeys.has(k) ? -1 : oldIdx;
  }

  return { newKeys, newKeySet, newItems, newNodes, newStates, newIndices, trKeys, trItems, trIdxs };
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
  if (htmlPartCount === 1) {
    sanitizedFragments = [sanitizeHtml(htmlParts[0]!)];
  } else if (htmlPartCount > 1) {
    const batchId = (listBatchIdCounter++).toString(36);
    const batchSeparator = `<template data-atom-sep="${batchId}"></template>`;
    sanitizedFragments = sanitizeHtml(htmlParts.join(batchSeparator)).split(batchSeparator);
  }

  const useInnerHtml =
    isInitial &&
    sanitizedFragments !== null &&
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

    if (state === 2) {
      const oldEl = newNodes[targetIdx]![0];
      if (oldEl) registry.cleanupTree(oldEl);
      newNodes[targetIdx]!.replaceWith($el);
    }

    newNodes[targetIdx] = $el;
  }

  return null;
}

function cleanupRemoved<T>(ctx: ListContext<T>, newKeySet: Set<ListKey>): void {
  const { oldKeys, oldNodes } = ctx;
  for (let i = 0, len = oldKeys.length; i < len; i++) {
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
        newNodes[i] = $el;
        newStates[i] = 0;
        ctx.removingKeys.delete(newKeys[i]!);
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
    const k = newKeys[i]!;
    const item = newItems[i]!;
    const $el = newNodes[i];
    if (!$el) continue;

    const state = newStates[i]!;
    applyItemCallbacks(state, $el, item, i, bind, update);

    if (state === 1) {
      // new
      if (onAdd) onAdd($el);
      ctx.removingKeys.delete(k);
      if (debug.enabled) debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', item);
    }
  }
}

function syncEventIndices<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { newKeys, newKeySet, newNodes } = diff;
  const itemCount = newKeys.length;
  const { oldKeys, elToKey, keyToIndex } = ctx;

  for (let i = 0, len = oldKeys.length; i < len; i++) {
    const k = oldKeys[i]!;
    if (!newKeySet.has(k)) {
      keyToIndex.delete(k);
    }
  }
  for (let i = 0; i < itemCount; i++) {
    const k = newKeys[i]!;
    const $el = newNodes[i];
    if ($el) {
      for (let j = 0; j < $el.length; j++) {
        const rootEl = $el[j];
        if (rootEl) elToKey.set(rootEl, k);
      }
      keyToIndex.set(k, i);
    }
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
        cleanupRemoved(ctx, diff.newKeySet);
        placeItems(ctx, diff, rawContainer, $container, callbacks, innerHtmlFragments);

        if (events) syncEventIndices(ctx, diff);

        ctx.oldKeys = diff.newKeys;
        ctx.oldItems = diff.newItems;
        ctx.oldNodes = diff.newNodes;
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
          let node: HTMLElement | null = this as HTMLElement | null;
          while (node && node !== rawContainer) {
            const k = ctx.elToKey.get(node);
            if (k !== undefined) {
              const idx = ctx.keyToIndex.get(k);
              if (idx !== undefined) {
                handler.call(this as HTMLElement, ctx.oldItems[idx]!, idx, e);
              }
              return;
            }
            node = node.parentElement;
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
