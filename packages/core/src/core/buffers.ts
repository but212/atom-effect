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
  /**
   * Active (non-null) element count across slots + overflow.
   * This property specifically tracks "active elements", not the "length" of the buffer.
   */
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

  /**
   * Overwrites an item at a specific index.
   * Correctly maintains the active element count.
   */
  setAt(index: number, item: T | null): void {
    const prev = this.getAt(index);
    if (prev === item) return;

    if (prev !== null) {
      this._onItemRemoved(prev);
    }

    this._directSetAt(index, item);

    if (prev === null && item !== null) {
      this._count++;
    } else if (prev !== null && item === null) {
      this._count--;
    }
  }

  /**
   * Internal set without count management.
   * Useful for bulk operations in subclasses.
   */
  protected _directSetAt(index: number, item: T | null): void {
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
  }

  /**
   * Discards all items from the given index onwards.
   * Correctly calls `_onItemRemoved` and maintains `_count`.
   */
  truncateFrom(index: number): void {
    // 1. Inline Slots Cleanup
    if (index < 4) {
      if (index <= 0) this._clearInline(0);
      if (index <= 1) this._clearInline(1);
      if (index <= 2) this._clearInline(2);
      if (index <= 3) this._clearInline(3);
    }

    // 2. Overflow Cleanup
    const ov = this._overflow;
    if (ov !== null) {
      const startIdx = index > 4 ? index - 4 : 0;
      const len = ov.length;
      for (let i = startIdx; i < len; i++) {
        const item = ov[i];
        if (item != null) {
          this._onItemRemoved(item);
          ov[i] = null;
          this._count--;
        }
      }

      if (index <= 4) {
        ov.length = 0;
        this._overflow = null;
      } else {
        ov.length = startIdx;
      }
    }

    // 3. Invalidate free indices
    if (this._freeIndices !== null) {
      this._freeIndices = null;
    }
  }

  private _clearInline(idx: number): void {
    const prop = idx === 0 ? '_s0' : idx === 1 ? '_s1' : idx === 2 ? '_s2' : '_s3';
    const s = this[prop];
    if (s !== null) {
      this._onItemRemoved(s);
      this[prop] = null;
      this._count--;
    }
  }

  /**
   * Protected hook called whenever an item is logically removed from the buffer.
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
    if (this._count === 0) return false;

    // 1. Inline Slots
    if (this._s0 === item || this._s1 === item || this._s2 === item || this._s3 === item) {
      return true;
    }

    // 2. Overflow Scan
    const ov = this._overflow;
    if (ov !== null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) return true;
      }
    }
    return false;
  }

  /**
   * Traverses all active items in the buffer.
   */
  forEach(fn: (item: T) => void): void {
    this.forEachIndexed(fn);
  }

  /**
   * Traverses all active items and returns the total count of executed items.
   */
  forEachIndexed(fn: (item: T) => void): number {
    const count = this._count;
    if (count === 0) return 0;

    // 1. Inline slots
    let executed = 0;
    const s0 = this._s0;
    if (s0 !== null) {
      fn(s0);
      if (++executed === count) return executed;
    }
    const s1 = this._s1;
    if (s1 !== null) {
      fn(s1);
      if (++executed === count) return executed;
    }
    const s2 = this._s2;
    if (s2 !== null) {
      fn(s2);
      if (++executed === count) return executed;
    }
    const s3 = this._s3;
    if (s3 !== null) {
      fn(s3);
      if (++executed === count) return executed;
    }

    // 2. Overflow
    const ov = this._overflow;
    if (ov !== null) {
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
   */
  compact(): void {
    const ov = this._overflow;
    if (ov === null) return;

    let len = ov.length;
    if (len === 0) return;

    // Pop-and-swap compaction
    let i = 0;
    while (i < len) {
      if (ov[i] === null) {
        while (len > i && ov[len - 1] === null) {
          ov.pop();
          len--;
        }
        if (len > i) {
          ov[i] = ov.pop()!;
          len--;
          i++;
        }
      } else {
        i++;
      }
    }

    this._freeIndices = null;
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
 * properties (`_s0`...`_s3`).
 */
export class DepSlotBuffer extends SlotBuffer<DependencyLink> {
  private _map: Map<Dependency, number> | null = null;
  private readonly _SCAN_THRESHOLD = 32;

  /** Indicates if the buffer contains at least one computed dependency. */
  hasComputeds = false;

  /** Resets tracking metadata. */
  prepareTracking(): void {
    this.hasComputeds = false;
  }

  /** Protected hook called whenever a link is extracted from the buffer. */
  protected override _onItemRemoved(link: DependencyLink): void {
    const unsub = link.unsub;
    if (unsub) unsub();
  }

  /**
   * Looks for an existing subscription and relocates it to `trackIndex`.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    const ovLimitCheck = this._overflow;
    const limit = ovLimitCheck ? ovLimitCheck.length + 4 : 4;
    if (trackIndex >= limit) return false;

    const count = this._count;
    if (count === 0) return false;

    // 1. Hybrid O(1) Map Fallback for Mega-Nodes
    const remaining = count - trackIndex;
    if (this._map !== null || remaining > this._SCAN_THRESHOLD) {
      return this._claimViaMap(dep, trackIndex);
    }

    // 2. Unrolled Fast Path for Inline Slots (0..3)
    if (trackIndex < 4) {
      switch (trackIndex) {
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough
        case 0: {
          const l = this._s0;
          if (l?.node === dep && l.unsub) {
            l.version = dep.version;
            return true;
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough
        case 1: {
          if (count > 1) {
            const l = this._s1;
            if (l?.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 1) this._relocate(1, trackIndex, l);
              return true;
            }
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough
        case 2: {
          if (count > 2) {
            const l = this._s2;
            if (l?.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 2) this._relocate(2, trackIndex, l);
              return true;
            }
          }
        }
        case 3: {
          if (count > 3) {
            const l = this._s3;
            if (l?.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 3) this._relocate(3, trackIndex, l);
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
      const startIdx = trackIndex > 4 ? trackIndex : 4;
      for (let i = startIdx - 4; i < ov.length; i++) {
        const link = ov[i];
        if (link && link.node === dep && link.unsub) {
          link.version = dv;
          this._relocate(i + 4, trackIndex, link);
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
      // Populate Map starting from trackIndex
      const s0 = this._s0;
      if (trackIndex <= 0 && s0?.unsub) map.set(s0.node, 0);
      const s1 = this._s1;
      if (trackIndex <= 1 && s1?.unsub) map.set(s1.node, 1);
      const s2 = this._s2;
      if (trackIndex <= 2 && s2?.unsub) map.set(s2.node, 2);
      const s3 = this._s3;
      if (trackIndex <= 3 && s3?.unsub) map.set(s3.node, 3);

      const ov = this._overflow;
      if (ov && count > 4) {
        const startIdx = trackIndex > 4 ? trackIndex : 4;
        for (let i = startIdx - 4; i < ov.length; i++) {
          const l = ov[i];
          if (l?.unsub) map.set(l.node, i + 4);
        }
      }
    }

    const existingIndex = map.get(dep);
    const ovLimitCheck = this._overflow;
    const limit = ovLimitCheck ? ovLimitCheck.length + 4 : 4;
    if (existingIndex === undefined || existingIndex < trackIndex || existingIndex >= limit)
      return false;

    const link = this.getAt(existingIndex);
    if (link == null || !link.unsub) return false;

    link.version = dep.version;
    if (existingIndex !== trackIndex) {
      const occupant = this.getAt(trackIndex);
      this._directSetAt(trackIndex, link);
      this._directSetAt(existingIndex, occupant);

      if (occupant?.unsub) map.set(occupant.node, existingIndex);
      map.set(dep, trackIndex);
    }
    return true;
  }

  private _relocate(fromAt: number, toAt: number, link: DependencyLink): void {
    const occupant = this.getAt(toAt);
    this._directSetAt(toAt, link);
    this._directSetAt(fromAt, occupant);
  }

  insertNew(trackIndex: number, link: DependencyLink): void {
    const occupant = this.getAt(trackIndex);

    if (occupant !== null) {
      this._addToOverflow(occupant);
      if (this._map !== null && occupant.unsub) {
        this._map.set(occupant.node, this._count - 1);
      }
    }

    this._directSetAt(trackIndex, link);

    if (this._map !== null && link.unsub) {
      this._map.set(link.node, trackIndex);
    }

    if (occupant === null) {
      this._count++;
    }
  }

  truncateFrom(index: number): void {
    super.truncateFrom(index);
    if (this._map !== null) {
      this._map.clear();
      this._map = null;
    }
  }

  disposeAll(): void {
    if (this._count > 0) this.truncateFrom(0);
    this.hasComputeds = false;
  }

  override remove(_item: DependencyLink): boolean {
    throw new Error('remove() is prohibited in DepSlotBuffer.');
  }

  override compact(): void {
    // No-op
  }
}
