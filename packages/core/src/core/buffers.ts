// ── SlotBuffer ──────────────────────────────────────────────────────────

/**
 * A ultra-high-performance, allocation-optimized container for reactive subscribers.
 *
 * Design Philosophy:
 * 1. Inline Storage: Uses 4 object properties (_s0.._s3) to store items directly.
 *    Since >90% of reactive nodes have 1-4 subscribers, this avoids array creation entirely.
 * 2. Spill-over Model: Shifts to a lazy-allocated overflow array only when necessary.
 * 3. Size Duality: Distinguishes between Physical Boundary (_count) and Logical Size (_actualCount)
 *    to support fast iteration while maintaining hole-reuse capabilities.
 */
export class SlotBuffer<T> {
  // Physical high-water mark first for better V8 object layout (numbers)
  /** Physical high-water mark. Indicates the highest index ever occupied + 1. */
  _count = 0;
  /** Logical element count. Number of non-null items currently in the buffer. */
  _actualCount = 0;

  // Direct property slots for ultra-fast access and zero allocation.
  _s0: T | null = null;
  _s1: T | null = null;
  _s2: T | null = null;
  _s3: T | null = null;

  /** Lazy overflow container for index >= 4. */
  _overflow: (T | null)[] | null = null;
  /** LIFO reuse-stack of freed overflow indices to maintain O(1) addition. */
  _freeIndices: number[] | null = null;

  // ── Internal Physical Primitives ──────────────────────────────────────

  /**
   * Low-level atomic write.
   * Does NOT update bookkeeping counters. Used as a building block for higher APIs.
   */
  protected _rawWrite(index: number, item: T | null): void {
    if (index < 4) {
      if (index === 0) this._s0 = item;
      else if (index === 1) this._s1 = item;
      else if (index === 2) this._s2 = item;
      else this._s3 = item;
    } else {
      if (this._overflow === null) this._overflow = [];
      const ov = this._overflow;
      ov[index - 4] = item;
    }
  }

  /**
   * Finds the first available hole or appends to the tail.
   * Returns the assigned physical index.
   */
  protected _rawAdd(item: T): number {
    if (this._s0 === null) {
      this._s0 = item;
      return 0;
    }
    if (this._s1 === null) {
      this._s1 = item;
      return 1;
    }
    if (this._s2 === null) {
      this._s2 = item;
      return 2;
    }
    if (this._s3 === null) {
      this._s3 = item;
      return 3;
    }

    if (this._overflow === null) this._overflow = [];
    const ov = this._overflow;
    const free = this._freeIndices;
    if (free !== null && free.length > 0) {
      const idx = free.pop()!;
      ov[idx] = item;
      return idx + 4;
    }
    ov.push(item);
    return 3 + ov.length;
  }

  /** Atomic swap of two physical slots. Essential for dependency relocation. */
  protected _rawSwap(idxA: number, idxB: number): void {
    if (idxA === idxB) return;
    const valA = this.getAt(idxA);
    const valB = this.getAt(idxB);
    this._rawWrite(idxA, valB);
    this._rawWrite(idxB, valA);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Number of active (non-null) elements. */
  get size(): number {
    return this._actualCount;
  }
  /** Highest physical index + 1. */
  get physicalSize(): number {
    return this._count;
  }

  /** Retrieves item at the specified index. O(1). */
  getAt(index: number): T | null {
    if (index < 4) {
      if (index === 0) return this._s0;
      if (index === 1) return this._s1;
      if (index === 2) return this._s2;
      if (index === 3) return this._s3;
      return null;
    }
    const ov = this._overflow;
    return ov === null ? null : (ov[index - 4] ?? null);
  }

  /**
   * Sets item at index.
   * Forces recalculation of logic size and high-water mark reduction on nullification.
   */
  setAt(index: number, item: T | null): void {
    const old = this.getAt(index);
    if (old === item) return;

    this._rawWrite(index, item);

    // Sync logical count (Active items tracking)
    if (old === null) this._actualCount++;
    else if (item === null) this._actualCount--;

    // Sync physical high-water mark (Iteration boundary tracking)
    if (item !== null) {
      if (index >= this._count) this._count = index + 1;
    } else {
      this._shrinkPhysicalSizeFrom(index);
    }
  }

  /**
   * Shrinks high-water mark recursively from the tail.
   * Optimized to avoid getAt() overhead in tight loop.
   */
  private _shrinkPhysicalSizeFrom(index: number): void {
    if (index !== this._count - 1) return;
    this._count--;

    if (this._count > 4) {
      const ov = this._overflow!;
      while (this._count > 4 && ov[this._count - 5] === null) {
        this._count--;
      }
    }

    if (this._count === 4 && this._s3 === null) {
      this._count = 3;
      if (this._s2 === null) {
        this._count = 2;
        if (this._s1 === null) {
          this._count = 1;
          if (this._s0 === null) this._count = 0;
        }
      }
    }
  }

  /**
   * Truncates the buffer to a specific size.
   * Normalizes the high-water mark even if the current count is 0.
   */
  truncateFrom(index: number): void {
    // 1. Cleanup inline slots
    if (index <= 3) {
      if (index <= 3 && this._s3 !== null) {
        this._onItemRemoved(this._s3!);
        this._s3 = null;
        this._actualCount--;
      }
      if (index <= 2 && this._s2 !== null) {
        this._onItemRemoved(this._s2!);
        this._s2 = null;
        this._actualCount--;
      }
      if (index <= 1 && this._s1 !== null) {
        this._onItemRemoved(this._s1!);
        this._s1 = null;
        this._actualCount--;
      }
      if (index <= 0 && this._s0 !== null) {
        this._onItemRemoved(this._s0!);
        this._s0 = null;
        this._actualCount--;
      }
    }

    // 2. Cleanup overflow array
    const ov = this._overflow;
    if (ov !== null) {
      const ovStart = index > 4 ? index - 4 : 0;
      const len = ov.length;
      for (let i = ovStart; i < len; i++) {
        const item = ov[i];
        if (item !== null && item !== undefined) {
          this._onItemRemoved(item);
          ov[i] = null;
          this._actualCount--;
        }
      }
      if (index <= 4) {
        this._overflow = null;
      } else {
        ov.length = index - 4;
      }
    }

    this._count = index;
    if (this._actualCount < 0) this._actualCount = 0;
    this._freeIndices = null;
  }

  /**
   * Internal hook for resource cleanup (e.g. unsubscriptions).
   * @internal For use in DepSlotBuffer only.
   */
  protected _onItemRemoved(_item: T): void {}

  /** Appends an item to the buffer. Returns assigned index. O(1). */
  add(item: T): number {
    const idx = this._rawAdd(item);
    if (idx >= this._count) this._count = idx + 1;
    this._actualCount++;
    return idx;
  }

  /** Removes an item by reference. O(N). */
  remove(item: T): boolean {
    let idx = -1;
    if (this._s0 === item) idx = 0;
    else if (this._s1 === item) idx = 1;
    else if (this._s2 === item) idx = 2;
    else if (this._s3 === item) idx = 3;
    else {
      const ov = this._overflow;
      if (ov !== null) {
        idx = ov.indexOf(item);
        if (idx !== -1) idx += 4;
      }
    }

    if (idx !== -1) {
      this._rawWrite(idx, null);
      this._shrinkPhysicalSizeFrom(idx);
      this._actualCount--;
      if (idx >= 4) {
        if (this._freeIndices === null) this._freeIndices = [];
        const free = this._freeIndices;
        free.push(idx - 4);
      }
      return true;
    }
    return false;
  }

  /** O(N) presence check. */
  has(item: T): boolean {
    const actual = this._actualCount;
    if (actual === 0) return false;
    if (this._s0 === item || this._s1 === item || this._s2 === item || this._s3 === item)
      return true;
    const ov = this._overflow;
    if (ov !== null) return ov.indexOf(item) !== -1;
    return false;
  }

  /** Optimized iteration. Fast-path triggers when buffer is dense (no holes). */
  forEach(fn: (item: T) => void): void {
    const actual = this._actualCount;
    if (actual === 0) return;

    if (actual === this._count) {
      // Dense optimization: Avoid all null checks and property lookups
      fn(this._s0!);
      if (actual > 1) {
        fn(this._s1!);
        if (actual > 2) {
          fn(this._s2!);
          if (actual > 3) {
            fn(this._s3!);
            if (actual > 4) {
              const ov = this._overflow!;
              for (let i = 0, len = ov.length; i < len; i++) fn(ov[i]!);
            }
          }
        }
      }
      return;
    }

    // Sparse path: Unrolled for the first 4 slots
    let count = 0;
    if (this._s0 !== null) {
      fn(this._s0);
      if (++count >= actual) return;
    }
    if (this._s1 !== null) {
      fn(this._s1);
      if (++count >= actual) return;
    }
    if (this._s2 !== null) {
      fn(this._s2);
      if (++count >= actual) return;
    }
    if (this._s3 !== null) {
      fn(this._s3);
      if (++count >= actual) return;
    }

    const ov = this._overflow;
    if (ov !== null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const item = ov[i];
        if (item !== null && item !== undefined) {
          fn(item);
          if (++count >= actual) return;
        }
      }
    }
  }

  /** Elimination of all holes via in-place shifting. Zero-allocation. */
  compact(): void {
    const actual = this._actualCount;
    if (actual === this._count) return;

    if (actual === 0) {
      this.clear();
      return;
    }

    let writeIdx = 0;
    const limit = this._count;
    for (let readIdx = 0; readIdx < limit; readIdx++) {
      const item = this.getAt(readIdx);
      if (item !== null) {
        if (readIdx !== writeIdx) {
          this._rawWrite(writeIdx, item);
          this._rawWrite(readIdx, null);
        }
        writeIdx++;
        if (writeIdx === actual) break;
      }
    }

    this._count = actual;
    if (this._overflow !== null) {
      if (writeIdx <= 4) this._overflow = null;
      else this._overflow.length = writeIdx - 4;
    }
    this._freeIndices = null;
  }

  /** Complete reset and memory release. */
  clear(): void {
    this._s0 = this._s1 = this._s2 = this._s3 = null;
    this._count = 0;
    this._actualCount = 0;
    this._overflow = null;
    this._freeIndices = null;
  }

  dispose(): void {
    this.clear();
  }
}

// ── DepSlotBuffer ───────────────────────────────────────────────────────

import type { Dependency } from '@/types';
import type { DependencyLink } from './tracking';

/**
 * Specialized high-speed buffer for Dependency Tracking Cycles.
 */
export class DepSlotBuffer extends SlotBuffer<DependencyLink> {
  private _map: Map<Dependency, number> | null = null;
  private readonly _SCAN_THRESHOLD = 32;

  hasComputeds = false;
  prepareTracking(): void {
    this.hasComputeds = false;
  }

  protected override _onItemRemoved(link: DependencyLink): void {
    link.unsub?.();
  }

  /** Synchronizes the Node->Index Map when setting entries directly. */
  override setAt(index: number, item: DependencyLink | null): void {
    const old = this.getAt(index);
    super.setAt(index, item);

    if (this._map !== null) {
      if (old !== null) this._map.delete(old.node);
      if (item !== null) this._map.set(item.node, index);
    }
  }

  /**
   * Finds and reuses a dependency from a previous cycle.
   * Optimized hot-path with unrolled search.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    const length = this._count;
    if (length <= trackIndex) return false;

    // 1. Direct hit check (Unrolled for performance)
    let current: DependencyLink | null = null;
    if (trackIndex < 4) {
      if (trackIndex === 0) current = this._s0;
      else if (trackIndex === 1) current = this._s1;
      else if (trackIndex === 2) current = this._s2;
      else current = this._s3;
    } else {
      current = this._overflow![trackIndex - 4] ?? null;
    }

    if (current && current.node === dep && current.unsub) {
      current.version = dep.version;
      return true;
    }

    // 2. Map lookup
    if (this._map !== null || length - trackIndex > this._SCAN_THRESHOLD) {
      return this._claimViaMap(dep, trackIndex);
    }

    // 3. Sequential search: Unrolled for the first 4 slots
    let foundIdx = -1;
    let foundLink: DependencyLink | null = null;

    let i = trackIndex + 1;
    for (; i < 4 && i < length; i++) {
      const l = i === 1 ? this._s1 : i === 2 ? this._s2 : this._s3;
      if (l && l.node === dep && l.unsub) {
        foundIdx = i;
        foundLink = l;
        break;
      }
    }
    if (foundIdx === -1 && i < length) {
      const ov = this._overflow!;
      for (let j = i - 4, len = length - 4; j < len; j++) {
        const l = ov[j];
        if (l && l.node === dep && l.unsub) {
          foundIdx = j + 4;
          foundLink = l;
          break;
        }
      }
    }

    if (foundIdx !== -1) {
      foundLink!.version = dep.version;
      // Precise manual swap to avoid repeated index checks in _rawSwap
      this._rawWrite(trackIndex, foundLink);
      this._rawWrite(foundIdx, current);
      return true;
    }

    return false;
  }

  private _claimViaMap(dep: Dependency, trackIndex: number): boolean {
    if (this._map === null) this._map = this._initMap();
    const map = this._map;
    const existingIndex = map.get(dep);
    if (existingIndex === undefined || existingIndex < trackIndex) return false;

    const link = this.getAt(existingIndex);
    if (link === null || !link.unsub) return false;

    link.version = dep.version;

    if (existingIndex !== trackIndex) {
      const occupant = this.getAt(trackIndex);
      this._rawSwap(existingIndex, trackIndex);

      map.set(dep, trackIndex);
      if (occupant?.unsub) map.set(occupant.node, existingIndex);
    }
    return true;
  }

  private _initMap(): Map<Dependency, number> {
    const map = new Map<Dependency, number>();
    if (this._s0?.unsub) map.set(this._s0.node, 0);
    if (this._s1?.unsub) map.set(this._s1.node, 1);
    if (this._s2?.unsub) map.set(this._s2.node, 2);
    if (this._s3?.unsub) map.set(this._s3.node, 3);

    const ov = this._overflow;
    if (ov !== null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const link = ov[i];
        if (link?.unsub) map.set(link.node, i + 4);
      }
    }
    return map;
  }

  /**
   * Inserts a new link at trackIdx.
   * Optimized to avoid getAt/_rawWrite overhead.
   */
  insertNew(trackIdx: number, link: DependencyLink): void {
    let occupant: DependencyLink | null = null;
    if (trackIdx < 4) {
      if (trackIdx === 0) {
        occupant = this._s0;
        this._s0 = link;
      } else if (trackIdx === 1) {
        occupant = this._s1;
        this._s1 = link;
      } else if (trackIdx === 2) {
        occupant = this._s2;
        this._s2 = link;
      } else {
        occupant = this._s3;
        this._s3 = link;
      }
    } else {
      if (this._overflow === null) this._overflow = [];
      const ov = this._overflow;
      occupant = ov[trackIdx - 4] ?? null;
      ov[trackIdx - 4] = link;
    }

    if (occupant !== null) {
      const newIdx = this._rawAdd(occupant);
      if (newIdx >= this._count) this._count = newIdx + 1;
      if (this._map !== null && occupant.unsub) this._map.set(occupant.node, newIdx);
    }

    if (trackIdx >= this._count) this._count = trackIdx + 1;
    this._actualCount++;

    if (this._map !== null && link.unsub) this._map.set(link.node, trackIdx);
  }

  override add(item: DependencyLink): number {
    const idx = super.add(item);
    if (this._map !== null && item.unsub) this._map.set(item.node, idx);
    return idx;
  }

  override remove(_item: DependencyLink): boolean {
    throw new Error('remove() prohibited');
  }
  override compact(): void {}

  override truncateFrom(index: number): void {
    super.truncateFrom(index);
    if (this._map !== null) {
      this._map = null;
    }
  }

  disposeAll(): void {
    this.truncateFrom(0);
    this.hasComputeds = false;
  }
}
