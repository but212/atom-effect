import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import { sanitizeHtml } from './sanitize';
import type {
  EffectObject,
  ListItemEntry,
  ListItemState,
  ListKey,
  ListKeyFn,
  ListOptions,
  ReadonlyAtom,
} from './types';
import { getLIS, getSelector, hasOwn, shallowEqual } from './utils';

// ============================================================================
// Helpers
// ============================================================================

const listInstances = new WeakMap<Element, { fx: EffectObject; ctx: ListContext<unknown> }>();
let listBatchIdCounter = 0;

/**
 * Inserts `$el` before `nextNode` when `nextNode` is non-null and connected,
 * otherwise appends it to `$container`.
 */
function insertOrAppend($el: JQuery, nextNode: Node | null, $container: JQuery): void {
  if (nextNode?.isConnected) $el.insertBefore(nextNode);
  else $el.appendTo($container);
}

/**
 * Applies bind or update callback to an existing entry's element.
 * - `state === undefined` → item existed before; call `update` if provided.
 * - `state !== undefined` → item was just rendered; call `bind` if provided.
 */
function applyItemCallbacks<T>(
  state: ListItemState | undefined,
  entry: ListItemEntry<T>,
  item: T,
  index: number,
  bind: ListOptions<T>['bind'],
  update: ListOptions<T>['update']
): void {
  if (!entry.$el[0]) return;
  if (state === undefined) {
    if (update) update(entry.$el, item, index);
  } else if (bind) {
    bind(entry.$el, item, index);
  }
}

// ============================================================================
// ListContext
// ============================================================================

/**
 * Per-container mutable state + removal logic for a single atomList instance.
 * Replaces the flat closure variables from Phase 1.
 * @internal
 */
class ListContext<T> {
  readonly itemMap = new Map<ListKey, ListItemEntry<T>>();
  readonly removingKeys = new Set<ListKey>();
  oldKeys: ListKey[] = [];
  $emptyEl: JQuery | null = null;
  readonly elToKey = new WeakMap<Element, ListKey>();
  readonly keyToIndex = new Map<ListKey, number>();
  /** Assigned immediately after effect() returns. Used only inside commitRemoval callbacks. */
  fx?: EffectObject;

  constructor(
    public readonly $container: JQuery,
    private readonly containerSelector: string,
    private readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  scheduleRemoval(k: ListKey, entry: ListItemEntry<T>): void {
    const commitRemoval = () => {
      if (this.fx?.isDisposed) return;
      entry.$el.remove();
      this.removingKeys.delete(k);
      debug.log(LOG_PREFIXES.LIST, `${this.containerSelector} removed item:`, k);
    };
    if (!this.onRemove) {
      commitRemoval();
      return;
    }
    const result = this.onRemove(entry.$el);
    if (result instanceof Promise) {
      result.then(commitRemoval, commitRemoval);
    } else {
      commitRemoval();
    }
  }

  removeItem(k: ListKey, entry: ListItemEntry<T>): void {
    for (let j = 0; j < entry.$el.length; j++) {
      const el = entry.$el[j];
      if (el) this.elToKey.delete(el);
    }
    this.itemMap.delete(k);
    this.removingKeys.add(k);
    this.scheduleRemoval(k, entry);
  }

  dispose(): void {
    this.itemMap.clear();
    this.removingKeys.clear();
    this.oldKeys.length = 0;
    this.keyToIndex.clear();
    this.$emptyEl?.remove();
    this.$container.off('.atomList');
  }
}

// ============================================================================
// Internal diff types
// ============================================================================

/** Return value of buildIndices() */
interface PreparedDiff<T> {
  newKeys: ListKey[];
  newKeySet: Set<ListKey>;
  newIndices: Int32Array;
  trKeys: ListKey[];
  trItems: T[];
  trIdxs: number[];
}

/** Callback subset of ListOptions passed to placeItems. */
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

/**
 * Step 1: Handle empty list state.
 * Shows/hides the empty template and removes all current items.
 * Caller should `return` immediately after if `itemCount === 0`.
 */
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

  const { oldKeys, itemMap } = ctx;
  for (let i = 0, len = oldKeys.length; i < len; i++) {
    const k = oldKeys[i]!;
    const entry = itemMap.get(k);
    if (entry) ctx.removeItem(k, entry);
  }
  oldKeys.length = 0;
}

/**
 * Step 2: Build key/index structures for diff computation.
 */
function buildIndices<T>(
  ctx: ListContext<T>,
  items: T[],
  itemCount: number,
  getKey: ListKeyFn<T>,
  update: ListOptions<T>['update']
): PreparedDiff<T> {
  const { oldKeys, itemMap, removingKeys } = ctx;
  const oldIndexMap = new Map<ListKey, number>();
  for (let i = 0, len = oldKeys.length; i < len; i++) {
    oldIndexMap.set(oldKeys[i]!, i);
  }

  const newKeys: ListKey[] = new Array(itemCount);
  const newKeySet = new Set<ListKey>();
  const newIndices = new Int32Array(itemCount);
  // Parallel arrays replace an array-of-objects to reduce GC pressure and
  // improve cache locality when iterating targetsToRender (step 3).
  const trKeys: ListKey[] = [];
  const trItems: T[] = [];
  const trIdxs: number[] = [];

  for (let i = 0; i < itemCount; i++) {
    const item = items[i]!;
    const k = getKey(item, i);
    newKeys[i] = k;

    if (newKeySet.has(k)) {
      debug.warn(LOG_PREFIXES.LIST, ERROR_MESSAGES.DUPLICATE_KEY(k, i));
      newIndices[i] = -1;
      continue;
    }
    newKeySet.add(k);

    const entry = itemMap.get(k);
    if (!entry) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
      newIndices[i] = -1;
      continue;
    }

    const oldItem = entry.item;
    if (!update && oldItem !== item && !shallowEqual(oldItem, item)) {
      trKeys.push(k);
      trItems.push(item);
      trIdxs.push(i);
    }
    newIndices[i] = removingKeys.has(k) ? -1 : (oldIndexMap.get(k) ?? -1);
  }

  return { newKeys, newKeySet, newIndices, trKeys, trItems, trIdxs };
}

/**
 * Step 3: Render new/updated items safely converting strings to DOM via batch sanitization.
 * Creates $el nodes and updates ctx.itemMap for each target.
 * Returns innerHTML fragments if the fast path can be used, otherwise null.
 */
function renderItems<T>(
  ctx: ListContext<T>,
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { trKeys, trItems, trIdxs } = diff;
  const renderCount = trKeys.length;
  const itemMap = ctx.itemMap;
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

    const k = trKeys[t]!;
    const entry = itemMap.get(k);

    if (!entry) {
      itemMap.set(k, { $el, item: null as unknown as T, state: 'new' });
      continue;
    }

    const oldEl = entry.$el[0];
    if (oldEl) registry.cleanupTree(oldEl);
    entry.$el.replaceWith($el);
    entry.$el = $el;
    entry.state = 'replaced';
  }

  return null;
}

/**
 * Step 4: Remove keys no longer present in the new list.
 */
function cleanupRemoved<T>(ctx: ListContext<T>, newKeySet: Set<ListKey>): void {
  // Array iteration is faster than itemMap entries iteration,
  // and safely skips keys already in removingKeys since oldKeys
  // never overlaps with them.
  const { oldKeys, itemMap } = ctx;
  for (let i = 0, len = oldKeys.length; i < len; i++) {
    const k = oldKeys[i]!;
    if (newKeySet.has(k)) continue;

    const entry = itemMap.get(k);
    if (entry) ctx.removeItem(k, entry);
  }
}

/**
 * Step 5: Place and reorder DOM elements via LIS-based reconciliation.
 * `isInitial` is derived from `ctx.oldKeys.length === 0` inside the function.
 */
function placeItems<T>(
  ctx: ListContext<T>,
  items: T[],
  diff: PreparedDiff<T>,
  rawContainer: Element,
  $container: JQuery,
  callbacks: PlaceCallbacks<T>,
  innerHtmlFragments: string[] | null
): void {
  const { bind, update, onAdd } = callbacks;
  const { newKeys, newIndices } = diff;
  const itemCount = items.length;
  const isInitial = ctx.oldKeys.length === 0;

  const lisArr = getLIS(newIndices);
  let lisIdx = lisArr.length - 1;

  const { itemMap, removingKeys } = ctx;

  if (innerHtmlFragments !== null) {
    // ── Initial render: innerHTML fast path ──────────────
    rawContainer.innerHTML = innerHtmlFragments.join('');

    let childIdx = 0;
    for (let i = 0; i < itemCount; i++) {
      const k = newKeys[i]!;
      const item = items[i]!;

      // Note: If an item renders multiple sibling roots, childIdx++ only captures the first one.
      // This is a known limitation of the innerHTML fast-path from previous versions.
      const el = rawContainer.children[childIdx++] as HTMLElement | undefined;
      if (el) {
        const $el = $(el);
        itemMap.set(k, { $el, item, state: undefined });
        removingKeys.delete(k);
        debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', item);
      }
    }
    return;
  }

  if (isInitial) {
    // ── Initial render: accumulate into DocumentFragment ──────────────
    const fragment = document.createDocumentFragment();
    for (let i = itemCount - 1; i >= 0; i--) {
      const k = newKeys[i]!;
      const entry = itemMap.get(k);
      if (!entry) continue;

      const $el = entry.$el;
      for (let j = $el.length - 1; j >= 0; j--) {
        fragment.insertBefore($el[j]!, fragment.firstChild);
      }
    }
    rawContainer.appendChild(fragment);
  } else {
    // ── Incremental update: LIS-based reconciliation ──────────────────
    let nextNode: Node | null = null;
    for (let i = itemCount - 1; i >= 0; i--) {
      const k = newKeys[i]!;
      const entry = itemMap.get(k);
      if (!entry) continue;

      if (lisIdx >= 0 && lisArr[lisIdx] === i) {
        lisIdx--;
      } else {
        insertOrAppend(entry.$el, nextNode, $container);
      }

      nextNode = entry.$el[0] ?? null;
    }
  }

  // ── Post-DOM insertion: apply callbacks ───────────────────────────
  for (let i = 0; i < itemCount; i++) {
    const k = newKeys[i]!;
    const item = items[i]!;
    const entry = itemMap.get(k);
    if (!entry) continue;

    const state = entry.state;
    entry.item = item;
    entry.state = undefined;

    applyItemCallbacks(state, entry, item, i, bind, update);

    if (state === 'new') {
      if (onAdd) onAdd(entry.$el);
      removingKeys.delete(k);
      debug.domUpdated(LOG_PREFIXES.LIST, entry.$el, 'list.add', item);
    }
  }
}

/**
 * Step 5 (tail): Sync reverse/forward indexes for delegated event lookup.
 * Caller must check `if (events)` before calling.
 */
function syncEventIndices<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { newKeys, newKeySet } = diff;
  const itemCount = newKeys.length;
  const { oldKeys, itemMap, elToKey, keyToIndex } = ctx;

  // Remove stale entries for keys no longer in the list.
  for (let i = 0, len = oldKeys.length; i < len; i++) {
    const k = oldKeys[i]!;
    if (!newKeySet.has(k)) {
      keyToIndex.delete(k);
    }
  }
  // Register/update entries for keys in the new list.
  for (let i = 0; i < itemCount; i++) {
    const k = newKeys[i]!;
    const entry = itemMap.get(k);
    if (entry) {
      for (let j = 0; j < entry.$el.length; j++) {
        const rootEl = entry.$el[j];
        if (rootEl) elToKey.set(rootEl, k);
      }
      keyToIndex.set(k, i);
    }
  }
}

// ============================================================================
// atomList
// ============================================================================

/**
 * Reactive list rendering with LIS-based DOM reconciliation.
 *
 * Note: when `key` is a property name string, the resolved property value is
 * used as the Map key. The property must produce a `string | number` at
 * runtime — boolean or object values will be coerced by the Map and may cause
 * unexpected key collisions.
 */
$.fn.atomList = function <T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): JQuery {
  const { key, bind, update, onAdd, onRemove, empty, events } = options;

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

    // Unbind previous list delegation to prevent memory leaks when re-initializing
    $container.off('.atomList');
    // Clean up any previous atomList instance on this container
    const oldInstance = listInstances.get(rawContainer);
    if (oldInstance) {
      oldInstance.fx.dispose();
      oldInstance.ctx.dispose();
    }

    const containerSelector = getSelector(rawContainer);

    const ctx = new ListContext<T>($container, containerSelector, onRemove);

    const fx = effect(() => {
      // Only source.value is tracked. All side effects (DOM reads/writes,
      // render calls, bind calls) ran inside untracked() so they cannot
      // accidentally subscribe the list effect to atom reads within user callbacks.
      const items = source.value;
      const itemCount = items.length;

      untracked(() => {
        handleEmpty(ctx, itemCount, $container, empty);
        if (itemCount === 0) return;

        debug.log(LOG_PREFIXES.LIST, `${containerSelector} updating with ${itemCount} items`);

        const diff = buildIndices(ctx, items, itemCount, getKey, update);
        const isInitial = ctx.oldKeys.length === 0;

        const innerHtmlFragments = renderItems(ctx, diff, options, isInitial);
        cleanupRemoved(ctx, diff.newKeySet);
        placeItems(ctx, items, diff, rawContainer, $container, callbacks, innerHtmlFragments);

        if (events) syncEventIndices(ctx, diff);

        ctx.oldKeys = diff.newKeys;
      });
    });

    ctx.fx = fx;

    // ── Delegated event listeners ─────────────────────────────────────────
    // We leverage jQuery's native event delegation to properly handle bubbling
    // and correct semantics for mouseenter/mouseleave.
    if (events) {
      for (const eventKey in events) {
        if (!hasOwn.call(events, eventKey)) continue;
        const handler = events[eventKey]!;

        // Split "click .selector" → eventType="click", childSelector=".selector"
        const spaceIdx = eventKey.indexOf(' ');
        const eventType = spaceIdx === -1 ? eventKey : eventKey.slice(0, spaceIdx);
        const childSelector = spaceIdx === -1 ? null : eventKey.slice(spaceIdx + 1).trim();

        // If no child selector is provided, default to immediate children of container.
        // This ensures non-bubbling events like mouseenter work properly on item boundaries.
        const actualSelector = childSelector ? childSelector : '> *';

        const delegateHandler = function (this: Element, e: JQuery.TriggeredEvent) {
          // `this` is the matched delegated element.
          // Walk up to find the element that is actually an item root.
          let node: HTMLElement | null = this as HTMLElement | null;
          while (node && node !== rawContainer) {
            const k = ctx.elToKey.get(node);
            if (k !== undefined) {
              const entry = ctx.itemMap.get(k);
              if (entry) {
                handler.call(this as HTMLElement, entry.item, ctx.keyToIndex.get(k) ?? -1, e);
              }
              return;
            }
            node = node.parentElement;
          }
        };

        // Attach with namespace so cleanup can easily unbind all atomList events.
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
