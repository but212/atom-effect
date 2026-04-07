import { LOG_PREFIXES } from '@/constants';
import type { EffectObject, ListKey } from '@/types';
import { debug } from '@/utils/debug';
import { setAtomKey } from './utils';

/**
 * ListContext manages the state of a single atomList instance.
 * It tracks current keys, items, and DOM nodes to perform efficient reconciliation.
 * It also handles asynchronous removal of items and maintains reusable buffers.
 */
export class ListContext<T> {
  /** Keys of the items currently in the DOM. */
  oldKeys: ListKey[] = [];
  /** Actual items currently in the DOM. */
  oldItems: T[] = [];
  /** DOM elements or collections corresponding to the items. */
  oldNodes: (Element | JQuery | undefined)[] = [];

  /** Keys that are currently in the process of being removed (e.g., during an animation). */
  readonly removingKeys = new Set<ListKey>();
  /** The element displayed when the list is empty. */
  $emptyEl: JQuery | null = null;
  /** Mapping from key to its current index in the oldKeys/oldItems arrays. */
  readonly keyToIndex = new Map<ListKey, number>();
  /** The reactive effect managing this list. */
  fx?: EffectObject;

  /** Pre-allocated buffer for storing item states during diffing. */
  statesBuffer = new Uint8Array(256);
  /** Pre-allocated buffer for storing item indices during diffing. */
  indicesBuffer = new Int32Array(256);

  constructor(
    public readonly $container: JQuery,
    /** @internal */
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  /**
   * Schedules the removal of an element, optionally waiting for a promise returned by onRemove.
   *
   * @param k - The key of the item being removed.
   * @param $el - The jQuery collection representing the item's DOM nodes.
   */
  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      if (this.fx?.isDisposed) return;
      // Race condition check: If the element has been re-added to the list
      // (indicated by having a data-atom-key again), we must NOT remove it.
      if ($el[0] instanceof Element && $el[0].hasAttribute('data-atom-key')) return;

      if ($el[0]?.isConnected) $el.remove();
      this.removingKeys.delete(k);
      debug.log(LOG_PREFIXES.LIST, `${this.containerSelector} removed item:`, k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) res.then(commit, commit);
    else commit();
  }

  /**
   * Initiates the removal process for an item.
   *
   * @param k - The key of the item.
   * @param $el - The jQuery collection of the item.
   */
  removeItem(k: ListKey, $el: JQuery): void {
    setAtomKey($el, null); // Clear the key to allow re-addition detection
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  /**
   * Resets the context and cleans up resources.
   */
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

  /**
   * Ensures that the internal buffers are large enough for the given size.
   *
   * @param size - The required capacity of the buffers.
   */
  ensureBuffers(size: number): void {
    if (this.statesBuffer.length < size) {
      this.statesBuffer = new Uint8Array(Math.max(size, this.statesBuffer.length * 2));
    }
    if (this.indicesBuffer.length < size) {
      this.indicesBuffer = new Int32Array(Math.max(size, this.indicesBuffer.length * 2));
    }
  }
}
