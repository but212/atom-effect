/**
 * @module List Context
 *
 * Responsibility:
 * Manages the persistent state and lifecycle of a reactive list binding.
 *
 * Design Intent:
 * Tracks historical DOM snapshots and handles asynchronous removal transitions
 * (exit animations) to maintain visual stability and prevent memory leaks.
 */

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
 * Role: Persistent List State
 *
 * Reason:
 * Reactive lists require a stable reference to track historical DOM nodes across
 * multiple rendering cycles to support moves and patches.
 *
 * @internal
 */
export class ListContext<T> {
  /** Sequential snapshot of the previous render state. */
  #snapshots: ListSnapshot<T>[] = [];
  /** Keys currently undergoing asynchronous exit animations. */
  #removingKeys = new Set<ListKey>();
  /** Inverse lookup for O(1) index retrieval from a key. */
  #keyToIndex = new Map<ListKey, number>();
  /** Cached reference to the placeholder element shown when the list is empty. */
  #$emptyEl: JQuery | null = null;
  /** The reactive effect controlling this list. Needed to check disposal state during async tasks. */
  #fx: EffectObject | undefined = undefined;

  /** Target container element. */
  readonly #$container: JQuery;
  /** Selector for the container. */
  readonly #containerSelector: string;
  /** Optional removal lifecycle hook. */
  readonly #onRemove: (($el: JQuery) => Promise<void> | void) | undefined;

  constructor(
    $container: JQuery,
    containerSelector: string,
    onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {
    this.#$container = $container;
    this.#containerSelector = containerSelector;
    this.#onRemove = onRemove;
  }

  // Getters and setters for compatibility with existing functional logic
  get snapshots(): ListSnapshot<T>[] {
    return this.#snapshots;
  }
  set snapshots(value: ListSnapshot<T>[]) {
    this.#snapshots = value;
  }
  get removingKeys(): Set<ListKey> {
    return this.#removingKeys;
  }
  get keyToIndex(): Map<ListKey, number> {
    return this.#keyToIndex;
  }
  set keyToIndex(value: Map<ListKey, number>) {
    this.#keyToIndex = value;
  }
  get $emptyEl(): JQuery | null {
    return this.#$emptyEl;
  }
  set $emptyEl(value: JQuery | null) {
    this.#$emptyEl = value;
  }
  get fx(): EffectObject | undefined {
    return this.#fx;
  }
  set fx(value: EffectObject | undefined) {
    this.#fx = value;
  }
  get $container(): JQuery {
    return this.#$container;
  }
  get containerSelector(): string {
    return this.#containerSelector;
  }
  get onRemove() {
    return this.#onRemove;
  }

  /**
   * Retrieves the index of a key, handling string-to-number normalization.
   */
  getIndex(key: ListKey | string): number | undefined {
    const idx = this.#keyToIndex.get(key as ListKey);
    if (idx !== undefined) return idx;

    if (typeof key === 'string') {
      const n = Number.parseFloat(key);
      if (!Number.isNaN(n)) return this.#keyToIndex.get(n);
    }

    return undefined;
  }

  /**
   * Marks a key as "in transit" and starts the removal lifecycle.
   */
  remove(k: ListKey, $el: JQuery): void {
    setAtomKey($el, null);
    this.#removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  /**
   * Initiates the physical removal of an element.
   */
  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const res = this.#onRemove?.($el);

    if (res instanceof Promise) {
      const commit = () => this.commitRemoval(k, $el);
      res.then(commit, commit);
    } else {
      this.commitRemoval(k, $el);
    }
  }

  /**
   * Finalizes DOM removal and state cleanup.
   */
  commitRemoval(k: ListKey, $el: JQuery): void {
    if (this.#fx?.isDisposed) return;

    const el = $el[0];
    // Check if the element was re-bound to the list while we were waiting.
    if (el instanceof Element && el.hasAttribute('data-atom-key')) return;

    if (el?.isConnected) {
      $el.remove();
    }
    this.#removingKeys.delete(k);
  }

  /**
   * Resolves the nearest active list item's DOM element, its index, and the corresponding item
   * from a starting element, searching up to the container limit.
   */
  resolveEventTarget(
    start: HTMLElement,
    container: HTMLElement
  ): { target: HTMLElement; index: number; item: T } | null {
    let current: HTMLElement | null = start;
    while (current) {
      const rawKey = current.getAttribute('data-atom-key');
      if (rawKey !== null) {
        const index = this.getIndex(rawKey);
        if (index !== undefined) {
          const snapshot = this.#snapshots[index];
          if (snapshot) {
            return { target: current, index, item: snapshot.item };
          }
        }
      }
      if (current === container) break;
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Full cleanup of state and DOM references.
   */
  dispose(): void {
    this.#removingKeys.clear();
    this.#snapshots.length = 0;
    this.#keyToIndex.clear();
    this.#$emptyEl?.remove();
    this.#$container.off('.atomList');
  }
}
