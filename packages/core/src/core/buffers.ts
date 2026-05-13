/**
 * @module DependencyBuffers
 *
 * Responsibility:
 * Orchestrates the lifecycle of reactive connections between nodes. Manages
 * memory-efficient tracking, reconciliation, and dirty propagation checks.
 *
 * Design Intent:
 * Uses a hybrid storage strategy (SlotBuffer + O(1) Lookup Map) to minimize
 * allocation overhead during hot-path execution while maintaining fast
 * dependency resolution for large graphs.
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { BUFFER_CONFIG, COMPUTED_STATE_FLAGS, IS_DEV, LOG_PREFIX } from '@/constants';
import type { DepBufferState, Dependency, DependencyLink, Indexer } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Role: No-op implementation of the Indexer interface for empty buffers.
 * Optimization: Prevents Map allocation for small or empty dependency sets.
 */
const NullIndexer: Indexer = {
  get: () => undefined,
  set: () => {},
  delete: () => {},
};

/** @internal */
class MapIndexer extends Map<Dependency, number> implements Indexer {}

/**
 * Role: Core storage manager for reactive dependencies.
 *
 * Logic: Hybrid Storage
 * Combines a sequential SlotBuffer for ordered iteration with an optional
 * Map-based indexer for O(1) lookup in high-density dependency sets.
 */
export class DependencyBuffer implements DepBufferState {
  #slots = new SlotBuffer<DependencyLink>();
  #map: Indexer = NullIndexer;
  #hasComputeds = false;

  get slots() {
    return this.#slots;
  }
  get map() {
    return this.#map;
  }
  set map(v: Indexer) {
    this.#map = v;
  }
  get hasComputeds() {
    return this.#hasComputeds;
  }
  set hasComputeds(v: boolean) {
    this.#hasComputeds = v;
  }

  prepareTracking(): void {
    this.#hasComputeds = false;
  }

  /**
   * Logic: Subscription Reconciliation
   * Attempts to reuse an existing subscription from a previous run.
   * If found, it synchronizes the version and moves the link to the
   * current tracking index to preserve the subscription order.
   *
   * @returns True if an existing link was successfully reclaimed.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    const slots = this.#slots;
    if (slots.length <= trackIndex) return false;

    const current = slots.at(trackIndex);
    // Optimization: Fast-path for direct hit synchronization.
    if (current?.node === dep && current.unsub) {
      current.version = dep.version;
      return true;
    }

    const existingIndex = this.#findExistingIndex(dep, trackIndex);
    if (existingIndex === -1) return false;

    const link = slots.at(existingIndex)!;
    link.version = dep.version;

    // Logic: Index Swapping
    // Swap links to preserve subscription order and move the active link
    // to the front of the buffer for the next iteration.
    const temp = slots.at(trackIndex);
    this.setAt(trackIndex, link);
    this.setAt(existingIndex, temp);
    return true;
  }

  /**
   * Logic: Lookup Strategy
   * Uses the Map indexer if available; otherwise falls back to linear scanning.
   */
  #findExistingIndex(dep: Dependency, start: number): number {
    const idx = this.#map.get(dep);
    if (idx !== undefined) return idx >= start ? idx : -1;

    const slots = this.#slots;
    for (let i = start + 1, len = slots.length; i < len; i++) {
      const link = slots.at(i);
      if (link?.node === dep && link.unsub) return i;
    }
    return -1;
  }

  /**
   * Logic: Buffer Inplace Update
   * Replaces an existing slot or pushes to the end, ensuring that
   * any occupant is preserved if pushed further down.
   */
  insertNew(trackIdx: number, link: DependencyLink): void {
    const occupant = this.#slots.at(trackIdx);
    this.setAt(trackIdx, link);

    if (occupant !== null) {
      this.push(occupant);
    }
  }

  /**
   * Logic: Slot Synchronization
   * Updates the internal slot and maintains the index map consistency.
   */
  setAt(index: number, item: DependencyLink | null): void {
    const old = this.#slots.at(index);
    this.#slots.setAt(index, item);

    if (old) this.#map.delete(old.node);
    if (item?.unsub) {
      this.#ensureMap();
      if (this.#map !== NullIndexer) this.#map.set(item.node, index);
    }
  }

  push(item: DependencyLink): number {
    const idx = this.#slots.push(item);
    if (item.unsub) {
      this.#ensureMap();
      if (this.#map !== NullIndexer) this.#map.set(item.node, idx);
    }
    return idx;
  }

  /**
   * Optimization: Dynamic Indexing
   * Transitions from linear scanning to Map-based O(1) lookup once the
   * dependency count exceeds the configured threshold.
   */
  #ensureMap(): void {
    if (this.#map === NullIndexer && this.#slots.length > BUFFER_CONFIG.MAP_THRESHOLD) {
      this.#map = new MapIndexer();
      const slots = this.#slots;
      for (let i = 0; i < slots.length; i++) {
        const link = slots.at(i);
        if (link?.unsub) this.#map.set(link.node, i);
      }
    }
  }

  /**
   * Logic: Deep Dirty Check
   * Recursively validates the entire upstream dependency chain. Triggers
   * re-evaluation of Computeds to ensure the most current versions are compared.
   */
  isDirty(): boolean {
    const slots = this.#slots;
    const len = slots.length;
    if (slots.size === 0) return false;

    for (let i = 0; i < len; i++) {
      const link = slots.at(i);
      if (!link) continue;

      const dep = link.node;
      const isComputed = (dep.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0;

      if (isComputed) {
        try {
          // Logic: Forced Re-evaluation
          // Accessing '.value' triggers the computed's evaluation logic.
          dep.value;
        } catch {
          if (IS_DEV) debug.trackEvaluationFailure(dep.id);
        }
      }

      if (dep.version !== link.version) return true;
    }
    return false;
  }

  /**
   * Logic: Shallow Dirty Check
   * Performs a fast check without triggering re-evaluations.
   */
  isShallowDirty(): boolean {
    const slots = this.#slots;
    const len = slots.length;
    for (let i = 0; i < len; i++) {
      const link = slots.at(i);
      if (!link) continue;

      const dep = link.node;
      if (dep.version !== link.version || (dep.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Logic: Resource Cleanup
   * Unsubscribes all removed dependencies and releases slot references
   * to facilitate garbage collection.
   */
  truncateFrom(index: number): void {
    const slots = this.#slots;
    const len = slots.length;
    for (let i = index; i < len; i++) {
      const link = slots.at(i);
      if (link?.unsub) {
        try {
          link.unsub();
        } catch (e) {
          if (IS_DEV) console.error(`${LOG_PREFIX} Unsubscribe failed:`, e);
        }
      }
    }
    slots.truncateFrom(index);
    this.#map = NullIndexer;
  }

  disposeAll(): void {
    this.truncateFrom(0);
    this.#hasComputeds = false;
  }
}

/** @internal - Factory for DepBufferState. */
export function createDepBuffer(): DepBufferState {
  return new DependencyBuffer();
}

/** @internal - Proxies to class implementation. */
export function prepareTracking(state: DepBufferState): void {
  (state as DependencyBuffer).prepareTracking();
}

/** @internal - Proxies to class implementation. */
export function claimExisting(state: DepBufferState, dep: Dependency, trackIndex: number): boolean {
  return (state as DependencyBuffer).claimExisting(dep, trackIndex);
}

/** @internal - Proxies to class implementation. */
export function insertNew(state: DepBufferState, trackIdx: number, link: DependencyLink): void {
  (state as DependencyBuffer).insertNew(trackIdx, link);
}

/** @internal - Proxies to class implementation. */
export function depBufferSetAt(
  state: DepBufferState,
  index: number,
  item: DependencyLink | null
): void {
  (state as DependencyBuffer).setAt(index, item);
}

/** @internal - Proxies to class implementation. */
export function depBufferPush(state: DepBufferState, item: DependencyLink): number {
  return (state as DependencyBuffer).push(item);
}

/** @internal - Proxies to class implementation. */
export function isBufferDirty(state: DepBufferState): boolean {
  return (state as DependencyBuffer).isDirty();
}

/** @internal - Proxies to class implementation. */
export function isBufferShallowDirty(state: DepBufferState): boolean {
  return (state as DependencyBuffer).isShallowDirty();
}

/** @internal - Proxies to class implementation. */
export function depBufferTruncateFrom(state: DepBufferState, index: number): void {
  (state as DependencyBuffer).truncateFrom(index);
}

/** @internal - Proxies to class implementation. */
export function disposeAll(state: DepBufferState): void {
  (state as DependencyBuffer).disposeAll();
}
