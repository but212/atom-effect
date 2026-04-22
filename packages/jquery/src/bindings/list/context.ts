import type { EffectObject, ListKey } from '@/types';
import { setAtomKey } from './utils';

/**
 * Orchestrates the internal state and lifecycle management for the `$.fn.atomList` binding.
 *
 * This class maintains the historical state of the DOM list and coordinates
 * complex reconciliation logic, including the management of asynchronous
 * item removals and element reuse across rendering cycles.
 *
 * When to use:
 * - To manage state for dynamic list rendering within a jQuery container.
 * - To synchronize asynchronous DOM transitions (animations) with reactive state changes.
 *
 * @internal
 */
export class ListContext<T> {
  /**
   * Storage for keys from the previous rendering cycle.
   * @internal
   */
  oldKeys: ListKey[] = [];

  /**
   * Storage for item data from the previous rendering cycle.
   * @internal
   */
  oldItems: T[] = [];

  /**
   * Storage for DOM nodes from the previous rendering cycle.
   * @internal
   */
  oldNodes: (Element | JQuery | undefined)[] = [];

  /**
   * Tracks keys of items that are currently undergoing a removal animation.
   *
   * Logic: This set prevents the reconciliation logic from attempting to re-add
   * or manipulate an element that has been logically removed but is still
   * physically present in the DOM during a transition.
   */
  readonly removingKeys = new Set<ListKey>();

  /**
   * The cached DOM element displayed when the list is empty.
   * @internal
   */
  $emptyEl: JQuery | null = null;

  /**
   * A fast lookup map used to retrieve the previous index of a key during the diffing process.
   * @internal
   */
  readonly keyToIndex = new Map<ListKey, number>();

  /**
   * The parent Effect object governing this context.
   * @internal
   */
  fx?: EffectObject;

  constructor(
    /** The parent jQuery container for the list. */
    public readonly $container: JQuery,
    /** The selector string identifying list items. */
    public readonly containerSelector: string,
    /** An optional callback invoked when an item is removed, supporting async animations. */
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  /**
   * Coordinates the removal of an element from the DOM, potentially after an animation.
   *
   * Constraint:
   * - Operation is aborted if the parent effect has been disposed to prevent memory leaks.
   * - Removal is canceled if the element has been reclaimed by a new rendering cycle
   *   (detected via the `data-atom-key` attribute).
   *
   * @param k - The unique key of the item being removed.
   * @param $el - The jQuery-wrapped element to remove.
   */
  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      // Reason: If the effect is disposed or the element has been reassigned to a new key
      // during an asynchronous delay, we must preserve the element's current state.
      if (this.fx?.isDisposed) return;

      if ($el[0] instanceof Element && $el[0].hasAttribute('data-atom-key')) return;

      if ($el[0]?.isConnected) $el.remove();
      this.removingKeys.delete(k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) {
      res.then(commit, commit);
    } else {
      commit();
    }
  }

  /**
   * Logically removes an item and initiates its physical removal from the DOM.
   *
   * Logic: The `data-atom-key` is cleared immediately to allow the element to be
   * reclaimed or treated as inactive by subsequent rendering cycles while the
   * removal animation is still in progress.
   *
   * @param k - The unique key of the item.
   * @param $el - The jQuery-wrapped element.
   */
  removeItem(k: ListKey, $el: JQuery): void {
    setAtomKey($el, null);
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  /**
   * Cleans up the context state and releases DOM references.
   *
   * Caution: Failure to invoke this method will result in memory leaks as
   * historical snapshots and item references are retained.
   */
  dispose(): void {
    this.removingKeys.clear();
    this.oldKeys = [];
    this.oldItems = [];
    this.oldNodes = [];
    this.keyToIndex.clear();
    this.$emptyEl?.remove();

    // Logic: Namespaced event removal prevents interference with other user-defined
    // handlers on the same container.
    this.$container.off('.atomList');
  }
}
