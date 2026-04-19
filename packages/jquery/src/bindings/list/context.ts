import type { EffectObject, ListKey } from '@/types';
import { setAtomKey } from './utils';

/**
 * Manages the internal state and lifecycle for $.fn.atomList.
 *
 * Responsibilities:
 * - Stores previous state (Keys, Items, Nodes) for the diffing algorithm.
 * - Tracks elements undergoing asynchronous removal (animations) to prevent conflicts.
 * - Handles container-level event cleanup and memory management.
 */
export class ListContext<T> {
  /** Reference storage for diffing and DOM reuse */
  oldKeys: ListKey[] = [];

  oldItems: T[] = [];

  oldNodes: (Element | JQuery | undefined)[] = [];

  /**
   * Tracks keys of items currently in the middle of a removal animation.
   * Reason: Prevents the reconciliation logic from attempting to re-add or manipulate
   * an element that is still being transitioned out of the DOM.
   */
  readonly removingKeys = new Set<ListKey>();

  /** Cached element to display when the list is empty */
  $emptyEl: JQuery | null = null;

  /** Fast lookup map to find the previous index of a key during diffing */
  readonly keyToIndex = new Map<ListKey, number>();

  /** The parent Effect. If disposed, all DOM manipulations must cease immediately. */
  fx?: EffectObject;

  constructor(
    public readonly $container: JQuery,
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  /**
   * Orchestrates the removal of an element, respecting the optional `onRemove` hook.
   *
   * Constraints:
   * 1. Aborts if the effect has been disposed.
   * 2. Aborts if the element was reclaimed by another binding (checked via `data-atom-key`).
   */
  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      // Reason: If the effect is disposed or the element has been re-assigned to a new key
      // during the async delay, we must not remove it from the DOM.
      if (this.fx?.isDisposed) return;

      if ($el[0] instanceof Element && $el[0].hasAttribute('data-atom-key')) return;

      if ($el[0]?.isConnected) $el.remove();
      this.removingKeys.delete(k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) res.then(commit, commit);
    else commit();
  }

  /**
   * Marks an item for removal and initiates the teardown process.
   *
   * @example
   * context.removeItem('item_id_1', $itemElement);
   */
  removeItem(k: ListKey, $el: JQuery): void {
    // Note: Clear the atom-key immediately so rendering cycles don't treat this
    // element as "active" while the removal animation is pending.
    setAtomKey($el, null);
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  /**
   * Clears all references and unbinds container events.
   * Crucial for preventing memory leaks in large, frequently updated lists.
   */
  dispose(): void {
    this.removingKeys.clear();
    this.oldKeys = [];
    this.oldItems = [];
    this.oldNodes = [];
    this.keyToIndex.clear();
    this.$emptyEl?.remove();

    // Use namespaced off() to avoid removing user-defined handlers on the same container
    this.$container.off('.atomList');
  }
}
