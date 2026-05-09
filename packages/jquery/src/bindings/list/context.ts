import type { EffectObject, ListKey } from '@/types';
import { setAtomKey } from './utils';

/**
 * Represents the state of a single list item at a point in time.
 * Used by the reconciler to calculate moves, updates, and removals.
 */
export interface ListSnapshot<T> {
  key: ListKey;
  item: T;
  /** The actual DOM element or JQuery wrapper currently representing this item. */
  node?: Element | JQuery | undefined;
}

/**
 * Persistent state for the `$.fn.atomList` binding.
 *
 * WHY:
 * Reactive lists require a stable reference to track historical DOM nodes across
 * multiple rendering cycles. Using a POJO (Plain Old JavaScript Object) ensures
 * state is decoupled from logic, following a functional "Relation Function" pattern.
 *
 * @internal
 */
export interface ListContext<T> {
  /** Sequential snapshot of the previous render state. */
  snapshots: ListSnapshot<T>[];
  /** Keys currently undergoing asynchronous exit animations. */
  readonly removingKeys: Set<ListKey>;
  /** Cached reference to the placeholder element shown when the list is empty. */
  $emptyEl: JQuery | null;
  /** Inverse lookup for O(1) index retrieval from a key. */
  keyToIndex: Map<ListKey, number>;
  /** The reactive effect controlling this list. Needed to check disposal state during async tasks. */
  fx?: EffectObject;
  /** Target container element. */
  readonly $container: JQuery;
  /** Selector for the container. */
  readonly containerSelector: string;
  /** Optional removal lifecycle hook. */
  readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined;
}

/**
 * Factory to initialize a new ListContext.
 */
export function createListContext<T>(
  $container: JQuery,
  containerSelector: string,
  onRemove: (($el: JQuery) => Promise<void> | void) | undefined
): ListContext<T> {
  return {
    snapshots: [],
    removingKeys: new Set<ListKey>(),
    $emptyEl: null,
    keyToIndex: new Map<ListKey, number>(),
    $container,
    containerSelector,
    onRemove,
  };
}

/**
 * Retrieves the index of a key, handling string-to-number normalization.
 *
 * WHY: DOM `data-atom-key` attributes are always strings. If the original
 * atom keys were numbers, a direct Map lookup will fail.
 *
 * @internal
 */
export function getListIndex<T>(ctx: ListContext<T>, key: ListKey | string): number | undefined {
  const map = ctx.keyToIndex;
  const idx = map.get(key as ListKey);
  if (idx !== undefined) return idx;

  if (typeof key === 'string') {
    const n = +key;
    if (!Number.isNaN(n)) return map.get(n);
  }

  return undefined;
}

/**
 * Marks a key as "in transit" and starts the removal lifecycle.
 * @internal
 */
export function removeListItem<T>(ctx: ListContext<T>, k: ListKey, $el: JQuery): void {
  setAtomKey($el, null);
  ctx.removingKeys.add(k);
  scheduleListItemRemoval(ctx, k, $el);
}

/**
 * Initiates the physical removal of an element.
 *
 * PERFORMANCE: Allocation-free path for synchronous removals.
 * Closures are only created if `onRemove` returns a Promise.
 * @internal
 */
export function scheduleListItemRemoval<T>(ctx: ListContext<T>, k: ListKey, $el: JQuery): void {
  const res = ctx.onRemove?.($el);

  if (res instanceof Promise) {
    const commit = () => commitListItemRemoval(ctx, k, $el);
    res.then(commit, commit);
  } else {
    commitListItemRemoval(ctx, k, $el);
  }
}

/**
 * Finalizes DOM removal and state cleanup.
 *
 * GUARD: If an element is "resurrected" (reused for a new key) during the
 * asynchronous removal delay, this method aborts to prevent accidental destruction.
 * @internal
 */
export function commitListItemRemoval<T>(ctx: ListContext<T>, k: ListKey, $el: JQuery): void {
  const fx = ctx.fx;
  if (fx?.isDisposed) return;

  const el = $el[0];
  // Check if the element was re-bound to the list while we were waiting.
  if (el instanceof Element && el.hasAttribute('data-atom-key')) return;

  if (el?.isConnected) {
    $el.remove();
  }
  ctx.removingKeys.delete(k);
}

/**
 * Full cleanup of state and DOM references.
 *
 * GC: Reuses the `snapshots` array instance (length = 0) to reduce
 * memory fragmentation on high-frequency list swaps.
 * @internal
 */
export function disposeListContext<T>(ctx: ListContext<T>): void {
  ctx.removingKeys.clear();
  ctx.snapshots.length = 0;
  ctx.keyToIndex.clear();
  ctx.$emptyEl?.remove();
  ctx.$container.off('.atomList');
}
