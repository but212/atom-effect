import type { EffectObject, ListKey } from '@/types';
import { setAtomKey } from './utils';

/**
 * Manages the reconciliation state and lifecycle for the `$.fn.atomList` binding.
 *
 * This context tracks historical DOM nodes and keys to enable efficient diffing.
 * Its primary responsibility is coordinating asynchronous item removals (e.g., animations)
 * while ensuring that elements reused in the same cycle are not accidentally destroyed.
 *
 * @internal
 */
export class ListContext<T> {
  private _oldKeys: ListKey[] = [];
  private _oldItems: T[] = [];
  private _oldNodes: (Element | JQuery | undefined)[] = [];
  private readonly _removingKeys = new Set<ListKey>();
  private _emptyEl: JQuery | null = null;
  private readonly _keyToIndex = new Map<ListKey, number>();

  public fx?: EffectObject;

  constructor(
    public readonly $container: JQuery,
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  get oldKeys() {
    return this._oldKeys;
  }
  set oldKeys(v) {
    this._oldKeys = v;
  }
  get oldItems() {
    return this._oldItems;
  }
  set oldItems(v) {
    this._oldItems = v;
  }
  get oldNodes() {
    return this._oldNodes;
  }
  set oldNodes(v) {
    this._oldNodes = v;
  }
  get removingKeys() {
    return this._removingKeys;
  }
  get keyToIndex() {
    return this._keyToIndex;
  }
  get $emptyEl() {
    return this._emptyEl;
  }
  set $emptyEl(v) {
    this._emptyEl = v;
  }

  /**
   * Retrieves the index of a key, supporting string-to-number normalization.
   *
   * Reason: DOM attributes (like `data-atom-key`) are always returned as strings,
   * but the internal `_keyToIndex` map might use numbers.
   */
  getIndex(key: ListKey | string): number | undefined {
    const idx = this._keyToIndex.get(key as ListKey);
    if (idx !== undefined) return idx;

    if (typeof key === 'string') {
      const n = Number(key);
      if (!Number.isNaN(n)) return this._keyToIndex.get(n);
    }
    return undefined;
  }

  /**
   * Orchestrates the physical removal of an element from the DOM.
   *
   * Logic:
   * 1. If `onRemove` returns a Promise, it waits for completion (e.g., a fade-out animation).
   * 2. Constraint: Before calling `.remove()`, it checks if the element has been "resurrected"
   *    (assigned a new `data-atom-key`) by a subsequent render cycle.
   */
  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      if (this.fx?.isDisposed) return;
      // Why: Prevent removing an element that was reused/resurrected during the removal delay.
      if ($el[0] instanceof Element && $el[0].hasAttribute('data-atom-key')) return;
      if ($el[0]?.isConnected) $el.remove();
      this._removingKeys.delete(k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) {
      res.then(commit, commit);
    } else {
      commit();
    }
  }

  /**
   * Marks a key as "removing" and initiates the removal sequence.
   *
   * Note: The `data-atom-key` attribute is cleared immediately to prevent the reconciler
   * from finding this "ghost" element via DOM lookups while animations are still running.
   */
  removeItem(k: ListKey, $el: JQuery): void {
    setAtomKey($el, null);
    this._removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  /**
   * Performs full cleanup of the list state and event listeners.
   */
  dispose(): void {
    this._removingKeys.clear();
    this._oldKeys = [];
    this._oldItems = [];
    this._oldNodes = [];
    this._keyToIndex.clear();
    this._emptyEl?.remove();
    this.$container.off('.atomList');
  }
}
