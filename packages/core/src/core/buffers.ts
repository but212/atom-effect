// ── SlotBuffer ──────────────────────────────────────────────────────────

/**
 * Inline-slot subscriber container.
 *
 * Stores up to 4 items directly as object properties
 * (zero array allocation). Spills to an overflow array only when the
 * inline slots are exhausted.
 *
 * Design goals:
 * - **Cache locality**: hot-path data lives on the same V8 object.
 * - **Logical deletion**: `remove()` nulls a slot and decrements `_count`.
 *   Physical compaction is deferred to `compact()`.
 * - **O(1) overflow reuse**: free-index stack avoids linear gap scan.
 *
 * @template T - Slot element type (e.g. `Subscription<V>`).
 */
export class SlotBuffer<T> {
  // ── Inline slots ──────────────────────────────────────────────────────
  // Always declared to lock V8 hidden class shape.
  _s0: T | null = null;
  _s1: T | null = null;
  _s2: T | null = null;
  _s3: T | null = null;

  // ── Bookkeeping ───────────────────────────────────────────────────────
  /** Active (non-null) element count across slots + overflow. */
  _count = 0;

  /** Lazy-allocated overflow array for subscribers beyond inline capacity. */
  _overflow: (T | null)[] | null = null;

  /** Free overflow indices for O(1) gap reuse (lazy-allocated). */
  _freeIndices: number[] | null = null;

  // ── Public API ────────────────────────────────────────────────────────

  /** Number of active (non-null) elements. */
  get size(): number {
    return this._count;
  }

  getAt(index: number): T | null {
    if (index < 4) {
      switch (index) {
        case 0:
          return this._s0;
        case 1:
          return this._s1;
        case 2:
          return this._s2;
        case 3:
          return this._s3;
      }
    }
    const ov = this._overflow;
    if (ov !== null) {
      const el = ov[index - 4];
      return el === undefined ? null : el;
    }
    return null;
  }

  /** Overwrites an item at a specific index. */
  setAt(index: number, item: T | null): void {
    switch (index) {
      case 0:
        this._s0 = item;
        break;
      case 1:
        this._s1 = item;
        break;
      case 2:
        this._s2 = item;
        break;
      case 3:
        this._s3 = item;
        break;
      default: {
        this._overflow ??= [];
        this._overflow[index - 4] = item;
      }
    }

    if (index >= this._count) {
      this._count = index + 1;
    }
  }

  truncateFrom(index: number): void {
    const count = this._count;
    if (index >= count) return;

    // 1. Unroll Inline Slots Cleanup: Simplified sequential check
    if (index <= 3) {
      if (index <= 0) {
        const s = this._s0;
        if (s != null) {
          this._onItemRemoved(s);
          this._s0 = null;
        }
      }
      if (index <= 1) {
        const s = this._s1;
        if (s != null) {
          this._onItemRemoved(s);
          this._s1 = null;
        }
      }
      if (index <= 2) {
        const s = this._s2;
        if (s != null) {
          this._onItemRemoved(s);
          this._s2 = null;
        }
      }
      if (index <= 3) {
        const s = this._s3;
        if (s != null) {
          this._onItemRemoved(s);
          this._s3 = null;
        }
      }
    }

    // 2. Overflow Cleanup
    const ov = this._overflow;
    if (ov !== null && count > 4) {
      const offsetIdx = index > 4 ? index - 4 : 0;
      const len = ov.length;
      for (let i = offsetIdx; i < len; i++) {
        const item = ov[i];
        if (item != null) {
          this._onItemRemoved(item);
          ov[i] = null;
        }
      }

      if (index <= 4) {
        ov.length = 0;
        this._overflow = null;
      } else {
        ov.length = index - 4;
      }
    }

    // 3. Invalidate free indices (they may point to truncated positions)
    if (this._freeIndices !== null) {
      this._freeIndices = null;
    }

    this._count = index;
  }

  /**
   * Protected hook called whenever an item is logically removed from the buffer.
   * Allows subclasses (like DepSlotBuffer) to perform cleanup (unsubscribing)
   * without allocating temporary closures in hot paths.
   */
  protected _onItemRemoved(_item: T): void {
    // Base implementation does nothing
  }

  /**
   * Adds an item.
   *
   * Prefers filling a null inline slot (including previously-cleared ones)
   * before spilling to the overflow array. Uses O(1) free-index stack
   * for overflow gap reuse.
   */
  add(item: T): void {
    // Fast path: fill inline slots first
    if (this._s0 === null) {
      this._s0 = item;
      this._count++;
      return;
    }
    if (this._s1 === null) {
      this._s1 = item;
      this._count++;
      return;
    }
    if (this._s2 === null) {
      this._s2 = item;
      this._count++;
      return;
    }
    if (this._s3 === null) {
      this._s3 = item;
      this._count++;
      return;
    }

    // Overflow path with O(1) free-index reuse
    this._addToOverflow(item);
  }

  /**
   * Internal helper to add an item directly to the overflow array,
   * bypassing inline slot checks. Used by DepSlotBuffer for relocation.
   *
   * @internal
   */
  protected _addToOverflow(item: T): void {
    const ov = this._overflow;
    if (ov === null) {
      this._overflow = [item];
    } else {
      const free = this._freeIndices;
      if (free !== null && free.length > 0) {
        ov[free.pop()!] = item;
      } else {
        ov.push(item);
      }
    }
    this._count++;
  }

  /**
   * Removes the first occurrence of {@link item} via identity comparison.
   *
   * The slot is nulled out (logical deletion). Call {@link compact}
   * after notification traversal to reclaim the gaps.
   *
   * @returns `true` if the item was found and removed.
   */
  remove(item: T): boolean {
    if (this._s0 === item) {
      this._s0 = null;
      this._count--;
      return true;
    }
    if (this._s1 === item) {
      this._s1 = null;
      this._count--;
      return true;
    }
    if (this._s2 === item) {
      this._s2 = null;
      this._count--;
      return true;
    }
    if (this._s3 === item) {
      this._s3 = null;
      this._count--;
      return true;
    }

    const ov = this._overflow;
    if (ov == null) return false;

    for (let i = 0, len = ov.length; i < len; i++) {
      if (ov[i] === item) {
        ov[i] = null;
        this._count--;
        // Track freed index for O(1) reuse
        let free = this._freeIndices;
        if (free === null) {
          free = this._freeIndices = [];
        }
        free.push(i);
        return true;
      }
    }
    return false;
  }

  has(item: T): boolean {
    const count = this._count;
    if (count === 0) return false;

    // 1. Inline Slots
    if (this._s0 === item || this._s1 === item || this._s2 === item || this._s3 === item) {
      return true;
    }

    // 2. Overflow Scan
    const ov = this._overflow;
    if (ov != null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) return true;
      }
    }
    return false;
  }

  /**
   * Iterates over all non-null elements.
   *
   * Safe to call during notification — newly-added or removed items
   * during iteration follow the same snapshot semantics as the old
   * array-based approach (length captured upfront for overflow).
   */
  forEach(fn: (item: T) => void): void {
    const count = this._count;
    if (count === 0) return;

    let executed = 0;
    // 1. Inline slots
    const s0 = this._s0;
    if (s0 != null) {
      fn(s0);
      if (++executed === count) return;
    }
    const s1 = this._s1;
    if (s1 != null) {
      fn(s1);
      if (++executed === count) return;
    }
    const s2 = this._s2;
    if (s2 != null) {
      fn(s2);
      if (++executed === count) return;
    }
    const s3 = this._s3;
    if (s3 != null) {
      fn(s3);
      if (++executed === count) return;
    }

    // 2. Overflow
    const ov = this._overflow;
    if (ov != null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const el = ov[i];
        if (el != null) {
          fn(el);
          if (++executed === count) return;
        }
      }
    }
  }

  /**
   * Iterates with index-based access for length-captured traversal.
   *
   * Returns the total number of slots to iterate (inline + overflow).
   * Used by `_notifySubscribers` for length-captured iteration.
   */
  forEachIndexed(fn: (item: T) => void): number {
    const count = this._count;
    if (count === 0) return 0;

    // 1. Inline slots
    let executed = 0;
    const s0 = this._s0;
    if (s0 != null) {
      fn(s0);
      if (++executed === count) return executed;
    }
    const s1 = this._s1;
    if (s1 != null) {
      fn(s1);
      if (++executed === count) return executed;
    }
    const s2 = this._s2;
    if (s2 != null) {
      fn(s2);
      if (++executed === count) return executed;
    }
    const s3 = this._s3;
    if (s3 != null) {
      fn(s3);
      if (++executed === count) return executed;
    }

    // 2. Overflow
    const ov = this._overflow;
    if (ov != null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const el = ov[i];
        if (el != null) {
          fn(el);
          if (++executed === count) return executed;
        }
      }
    }
    return executed;
  }

  /**
   * Compacts the overflow array by removing null gaps.
   *
   * Inline slots are not compacted — they stay null until reused by
   * `add()`. This keeps the V8 hidden class stable.
   */
  compact(): void {
    const ov = this._overflow;
    if (ov === null) return;

    let len = ov.length;
    if (len === 0) return;

    // Pop-and-swap compaction with proper null handling
    let i = 0;
    while (i < len) {
      if (ov[i] === null) {
        // Pop trailing nulls first to find a valid swap candidate
        while (len > i && ov[len - 1] === null) {
          ov.pop();
          len--;
        }
        // If there's still a valid element beyond i, swap it in
        if (len > i) {
          ov[i] = ov.pop()!;
          len--;
          i++;
        }
      } else {
        i++;
      }
    }

    // Invalidate free indices after compaction (positions have shifted)
    this._freeIndices = null;

    // Release overflow array when empty
    if (len === 0) {
      this._overflow = null;
    }
  }

  /**
   * Clears the buffer and releases all item references for GC.
   */
  clear(): void {
    this._s0 = null;
    this._s1 = null;
    this._s2 = null;
    this._s3 = null;
    this._count = 0;

    if (this._overflow !== null) {
      this._overflow.length = 0;
      this._overflow = null;
    }
    this._freeIndices = null;
  }

  /**
   * Hard dispose — releases all references for GC.
   */
  dispose(): void {
    this.clear();
  }
}

// ── DepSlotBuffer ───────────────────────────────────────────────────────

import type { Dependency } from '@/types';
import type { DependencyLink } from './tracking';

/**
 * Specialized inline-slot container for dependency tracking.
 *
 * Inherits from `SlotBuffer` to share the same zero-allocation inline
 * properties (`_s0`...`_s3`). Adds dependency-specific in-place updates,
 * truncation, and a hybrid O(1) Map fallback for mega-node performance.
 */
export class DepSlotBuffer extends SlotBuffer<DependencyLink> {
  private _map: Map<Dependency, number> | null = null;
  private readonly _SCAN_THRESHOLD = 32;

  /**
   * Indicates if the buffer contains at least one computed dependency.
   */
  hasComputeds = false;

  /**
   * Resets tracking metadata for a new evaluation pass.
   * Ensures 'hasComputeds' is clean.
   */
  prepareTracking(): void {
    this.hasComputeds = false;
  }

  /**
   * Protected hook called whenever a link is extracted from the buffer.
   * Handles automatic unsubscription without closure allocation.
   */
  protected override _onItemRemoved(link: DependencyLink): void {
    const unsub = link.unsub;
    if (unsub) unsub();
  }

  /**
   * Looks for an existing subscription to the given node starting from `trackIndex`.
   * If found, swaps it to `trackIndex`, updates version, and returns true.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    const count = this._count;
    if (trackIndex >= count) return false;

    // 1. Hybrid O(1) Map Fallback for Mega-Nodes
    const remaining = count - trackIndex;
    if (this._map !== null || remaining > this._SCAN_THRESHOLD) {
      return this._claimViaMap(dep, trackIndex);
    }

    // 2. Unrolled Fast Path for Inline Slots (0..3)
    // Avoids overhead of getAt/setAt by using switch-fallthrough and direct access.
    if (trackIndex < 4) {
      switch (trackIndex) {
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for sequential search
        case 0: {
          const l = this._s0;
          if (l && l.node === dep && l.unsub) {
            l.version = dep.version;
            return true;
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for sequential search
        case 1: {
          if (count > 1) {
            const l = this._s1;
            if (l && l.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 1) {
                // we know trackIndex is 0 here
                this._s1 = this._s0;
                this._s0 = l;
              }
              return true;
            }
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for sequential search
        case 2: {
          if (count > 2) {
            const l = this._s2;
            if (l && l.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 2) {
                // swap with trackIndex (0 or 1)
                const occ = trackIndex === 0 ? this._s0 : this._s1;
                if (trackIndex === 0) this._s0 = l;
                else this._s1 = l;
                this._s2 = occ;
              }
              return true;
            }
          }
        }
        case 3: {
          if (count > 3) {
            const l = this._s3;
            if (l && l.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 3) {
                // swap with trackIndex (0, 1, or 2)
                let occ: DependencyLink | null;
                if (trackIndex === 0) {
                  occ = this._s0;
                  this._s0 = l;
                } else if (trackIndex === 1) {
                  occ = this._s1;
                  this._s1 = l;
                } else {
                  occ = this._s2;
                  this._s2 = l;
                }
                this._s3 = occ;
              }
              return true;
            }
          }
        }
      }
    }

    // 3. Sequential Scan for Overflow
    const ov = this._overflow;
    if (ov) {
      const dv = dep.version;
      const start = trackIndex > 4 ? trackIndex : 4;
      const len = ov.length;
      for (let i = start - 4; i < len; i++) {
        const link = ov[i];
        if (link && link.node === dep && link.unsub) {
          link.version = dv;
          this._swapGeneral(i + 4, trackIndex, link);
          return true;
        }
      }
    }

    return false;
  }

  private _claimViaMap(dep: Dependency, trackIndex: number): boolean {
    let map = this._map;
    if (map === null) {
      map = this._map = new Map();
      const count = this._count;
      // Partitioned scan to avoid getAt() dispatch in loop
      if (trackIndex < 4) {
        const s0 = this._s0;
        if (trackIndex <= 0 && s0?.unsub) map.set(s0.node, 0);
        const s1 = this._s1;
        if (trackIndex <= 1 && s1?.unsub) map.set(s1.node, 1);
        const s2 = this._s2;
        if (trackIndex <= 2 && s2?.unsub) map.set(s2.node, 2);
        const s3 = this._s3;
        if (trackIndex <= 3 && s3?.unsub) map.set(s3.node, 3);
      }
      const ov = this._overflow;
      if (ov && count > 4) {
        const start = trackIndex > 4 ? trackIndex : 4;
        const len = ov.length;
        for (let i = start - 4; i < len; i++) {
          const link = ov[i];
          if (link?.unsub) map.set(link.node, i + 4);
        }
      }
    }

    const existingIndex = map.get(dep);
    if (existingIndex === undefined || existingIndex < trackIndex) return false;

    const link = this.getAt(existingIndex);
    if (link == null || !link.unsub) return false;

    link.version = dep.version;
    if (existingIndex !== trackIndex) {
      // Inlined swap to avoid dispatch overhead
      let occupant: DependencyLink | null;
      if (trackIndex === 0) occupant = this._s0;
      else if (trackIndex === 1) occupant = this._s1;
      else if (trackIndex === 2) occupant = this._s2;
      else if (trackIndex === 3) occupant = this._s3;
      else occupant = this._overflow![trackIndex - 4] ?? null;

      this.setAt(trackIndex, link);
      this.setAt(existingIndex, occupant);

      if (occupant?.unsub) map.set(occupant.node, existingIndex);
      map.set(dep, trackIndex);
    }
    return true;
  }

  private _swapGeneral(idx: number, trackIndex: number, link: DependencyLink): void {
    if (idx === trackIndex) return;

    // Use direct access for the likely case where idx is in overflow
    let occupant: DependencyLink | null;
    if (trackIndex === 0) occupant = this._s0;
    else if (trackIndex === 1) occupant = this._s1;
    else if (trackIndex === 2) occupant = this._s2;
    else if (trackIndex === 3) occupant = this._s3;
    else occupant = this._overflow![trackIndex - 4] ?? null;

    this.setAt(trackIndex, link);

    if (idx === 0) this._s0 = occupant;
    else if (idx === 1) this._s1 = occupant;
    else if (idx === 2) this._s2 = occupant;
    else if (idx === 3) this._s3 = occupant;
    else {
      const ov = this._overflow!;
      ov[idx - 4] = occupant;
    }
  }

  insertNew(trackIndex: number, link: DependencyLink): void {
    const count = this._count;
    if (trackIndex < count) {
      let occupant: DependencyLink | null;
      if (trackIndex === 0) occupant = this._s0;
      else if (trackIndex === 1) occupant = this._s1;
      else if (trackIndex === 2) occupant = this._s2;
      else if (trackIndex === 3) occupant = this._s3;
      else occupant = this._overflow![trackIndex - 4] ?? null;

      if (occupant != null) {
        // Direct overflow append avoids inline gap-scan overhead in add()
        // since we know all inline slots are occupied when trackIndex < count.
        this._addToOverflow(occupant);
        if (this._map !== null && occupant.unsub) {
          this._map.set(occupant.node, this._count - 1);
        }
      }
    }

    if (trackIndex === 0) this._s0 = link;
    else if (trackIndex === 1) this._s1 = link;
    else if (trackIndex === 2) this._s2 = link;
    else if (trackIndex === 3) this._s3 = link;
    else {
      let ov = this._overflow;
      if (!ov) {
        ov = [];
        this._overflow = ov;
      }
      ov[trackIndex - 4] = link;
    }

    if (trackIndex >= count) {
      this._count = trackIndex + 1;
    }
  }

  /**
   * Discards all links from the given index onwards.
   * Unsubscribes each link before removing it.
   */
  truncateFrom(index: number): void {
    if (index >= this._count) return;

    super.truncateFrom(index);

    if (this._map !== null) {
      this._map.clear();
      this._map = null;
    }
  }

  /** Unsubscribes from all links and resets the buffer. */
  disposeAll(): void {
    if (this._count > 0) {
      this.truncateFrom(0);
    }
    this.hasComputeds = false;
  }

  /**
   * [Safety Guard]
   * remove() is strictly prohibited in DepSlotBuffer to preserve sequential cache paths.
   */
  override remove(_item: DependencyLink): boolean {
    throw new Error(
      'remove() is strictly prohibited in DepSlotBuffer to preserve sequential cache paths.'
    );
  }

  /**
   * [Safety Guard]
   * Compaction is unnecessary since remove() is prohibited.
   */
  override compact(): void {
    // No-op for DepSlotBuffer
  }
}
