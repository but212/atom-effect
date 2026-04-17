/**
 * @module
 * Manages the lifecycle and state of list bindings.
 * Responsible for asynchronous removal, item index mapping, and resource cleanup.
 */
import { LOG_PREFIXES } from '@/constants';
import type { EffectObject, ListKey } from '@/types';
import { debug } from '@/utils/debug';
import { setAtomKey } from './utils';

/**
 * Manages the internal state for a single atomList instance.
 * Used to reference the previous state (Keys, Items, Nodes) during reconciliation.
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

  constructor(
    public readonly $container: JQuery,
    /** @internal */
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  /**
   * Schedules the removal of an element.
   * If the onRemove callback returns a Promise, removal is deferred.
   *
   * Note: A new item with the same key might be added while removal is pending.
   * The data-atom-key and connection status are re-verified at commit time to ensure consistency.
   */
  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      if (this.fx?.isDisposed) return;
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
   */
  removeItem(k: ListKey, $el: JQuery): void {
    setAtomKey($el, null);
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  /**
   * Resets the context and cleans up resources.
   */
  dispose(): void {
    this.removingKeys.clear();
    this.oldKeys = [];
    this.oldItems = [];
    this.oldNodes = [];
    this.keyToIndex.clear();
    this.$emptyEl?.remove();
    this.$container.off('.atomList');
  }
}
