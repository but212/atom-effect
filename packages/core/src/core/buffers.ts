// ── SlotBuffer ──────────────────────────────────────────────────────────

/**
 * An optimized container for managing reactive subscribers with minimal allocations.
 *
 * When to use:
 * - As internal storage for subscribers or dependencies within reactive nodes.
 * - In performance-critical paths where frequent array allocations should be avoided.
 *
 * Logic:
 * 1. Inline Storage: Utilizes 4 object properties (_s0.._s3) to store items directly.
 *    This avoids array creation for nodes with 4 or fewer subscribers (the majority case).
 * 2. Spill-over Model: Transitions to a lazy-allocated overflow array only when required.
 * 3. Size Duality: Maintains a physical high-water mark (_count) and a logical size (_actualCount)
 *    to support fast iteration and efficient hole reuse.
 */
export class SlotBuffer<T> {
  // Optimization: High-water mark is initialized first for consistent V8 object layout.
  /** The highest physical index occupied in the buffer plus one. */
  _count = 0;
  /** The number of active (non-null) items currently stored in the buffer. */
  _actualCount = 0;

  // Optimization: Direct properties provide faster access than indexed array lookups.
  _s0: T | null = null;
  _s1: T | null = null;
  _s2: T | null = null;
  _s3: T | null = null;

  /** A lazily initialized container for items at index 4 or higher. */
  _overflow: (T | null)[] | null = null;
  /** A LIFO stack of available indices in the overflow array to enable O(1) addition. */
  _freeIndices: number[] | null = null;

  // ── Internal Physical Primitives ──────────────────────────────────────

  /**
   * Performs a low-level atomic write to a physical slot.
   *
   * Logic: This method does not update bookkeeping counters and serves as a
   * primitive for higher-level operations.
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
   * Finds the first available slot (either a hole or the tail) and assigns the item.
   *
   * @returns The assigned physical index.
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

  /**
   * Performs an atomic swap of two physical slots.
   *
   * Logic: Essential for maintaining dependency order during relocation cycles.
   */
  protected _rawSwap(idxA: number, idxB: number): void {
    if (idxA === idxB) return;
    const valA = this.at(idxA);
    const valB = this.at(idxB);
    this._rawWrite(idxA, valB);
    this._rawWrite(idxB, valA);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** The number of active (non-null) elements in the buffer. */
  get length(): number {
    return this._actualCount;
  }
  /** The highest physical index occupied plus one. */
  get capacity(): number {
    return this._count;
  }

  /**
   * Retrieves the item at the specified physical index.
   *
   * @param index - The physical index to access.
   * @returns The item at the index, or null if the slot is empty or out of bounds.
   */
  at(index: number): T | null {
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
   * Updates a specific physical index and adjusts bookkeeping counters.
   *
   * Logic: Updates both the logical size and the physical high-water mark.
   * Nullifying a slot at the tail may trigger a recursive reduction of the physical size.
   */
  setAt(index: number, item: T | null): void {
    const old = this.at(index);
    if (old === item) return;

    this._rawWrite(index, item);

    if (old === null) this._actualCount++;
    else if (item === null) this._actualCount--;

    if (item !== null) {
      if (index >= this._count) this._count = index + 1;
    } else {
      this._shrinkPhysicalSizeFrom(index);
    }
  }

  /**
   * Reduces the high-water mark recursively from the tail of the buffer.
   *
   * Optimization: This internal logic is optimized to avoid repeated `getAt` calls.
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
   * Truncates the buffer starting from the specified index.
   */
  truncateFrom(index: number): void {
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
   * Internal hook for resource cleanup or unsubscription logic.
   * @internal Used specifically by DepSlotBuffer.
   */
  protected _onItemRemoved(_item: T): void {}

  /**
   * Appends an item to the buffer in the first available slot.
   *
   * @param item - The item to add.
   * @returns The assigned physical index.
   *
   * Optimization: Reuses existing holes in the overflow array where possible to minimize growth.
   */
  push(item: T): number {
    const idx = this._rawAdd(item);
    if (idx >= this._count) this._count = idx + 1;
    this._actualCount++;
    return idx;
  }

  /**
   * Removes an item by reference.
   *
   * Logic: Performs an O(N) search and updates the free index stack if the item
   * was located in the overflow array.
   */
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

  /**
   * Returns true if the item is present in the buffer.
   */
  has(item: T): boolean {
    const actual = this._actualCount;
    if (actual === 0) return false;
    if (this._s0 === item || this._s1 === item || this._s2 === item || this._s3 === item)
      return true;
    const ov = this._overflow;
    if (ov !== null) return ov.indexOf(item) !== -1;
    return false;
  }

  /**
   * Iterates over all active (non-null) items in the buffer.
   *
   * Optimization: Features a fast-path for dense buffers (no holes) to avoid
   * null checks and indexed property lookups.
   */
  forEach(fn: (item: T) => void): void {
    const actual = this._actualCount;
    if (actual === 0) return;

    if (actual === this._count) {
      // Logic: Dense optimization path.
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

    // Logic: Sparse path with unrolled checks for inline slots.
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

  /**
   * Eliminates all internal holes via in-place shifting.
   *
   * Optimization: Performs a zero-allocation compaction to ensure the buffer is dense.
   */
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
      const item = this.at(readIdx);
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

  /** Resets the buffer and releases internal memory. */
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
 * A specialized buffer optimized for dependency tracking and validation cycles.
 *
 * Logic: Extends SlotBuffer to provide O(1) node-to-index mappings via an internal
 * Map and supports "claiming" logic to reuse dependency links between re-evaluation cycles.
 */
export class DepSlotBuffer extends SlotBuffer<DependencyLink> {
  /** A lookup table for O(1) dependency resolution. Initialized lazily for large buffers. */
  private _map: Map<Dependency, number> | null = null;
  /** Threshold for transitioning from sequential scans to map-based resolution. */
  private readonly _SCAN_THRESHOLD = 32;

  /** Indicates whether the buffer contains any computed nodes. */
  hasComputeds = false;

  /** Prepares the buffer for a new tracking phase. */
  prepareTracking(): void {
    this.hasComputeds = false;
  }

  protected override _onItemRemoved(link: DependencyLink): void {
    link.unsub?.();
  }

  override setAt(index: number, item: DependencyLink | null): void {
    const old = this.at(index);
    super.setAt(index, item);

    if (this._map !== null) {
      if (old !== null) this._map.delete(old.node);
      if (item !== null) this._map.set(item.node, index);
    }
  }

  /**
   * Attempts to locate and reuse a dependency link from a previous cycle.
   *
   * Logic: Performs a multi-stage search beginning with a direct hit check at the
   * expected `trackIndex`. Falls back to an internal Map lookup or sequential scan.
   *
   * @param dep - The dependency node to identify.
   * @param trackIndex - The predicted physical index for the dependency.
   * @returns true if the dependency was successfully found and reused.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    const length = this._count;
    if (length <= trackIndex) return false;

    let current: DependencyLink | null = null;
    if (trackIndex < 4) {
      if (trackIndex === 0) current = this._s0;
      else if (trackIndex === 1) current = this._s1;
      else if (trackIndex === 2) current = this._s2;
      else current = this._s3;
    } else {
      current = this._overflow![trackIndex - 4] ?? null;
    }

    // Logic: Fast-path for direct hits where the dependency remains at the same position.
    if (current && current.node === dep && current.unsub) {
      current.version = dep.version;
      return true;
    }

    if (this._map !== null || length - trackIndex > this._SCAN_THRESHOLD) {
      return this._claimViaMap(dep, trackIndex);
    }

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
      // Optimization: Performs a manual swap to minimize index validation overhead.
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

    const link = this.at(existingIndex);
    if (link === null || !link.unsub) return false;

    link.version = dep.version;

    if (existingIndex !== trackIndex) {
      const occupant = this.at(trackIndex);
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
   * Inserts a new dependency link at the specified tracking index.
   *
   * Logic: If the slot is occupied, the previous occupant is shifted to a new slot.
   * This maintains the insertion order required for consistent validation cycles.
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

  override push(item: DependencyLink): number {
    const idx = super.push(item);
    if (this._map !== null && item.unsub) this._map.set(item.node, idx);
    return idx;
  }

  /**
   * Removal is prohibited for DepSlotBuffer to maintain graph integrity during validation.
   * Use truncateFrom(0) or disposeAll() for cleanup.
   *
   * @throws {Error} Always.
   */
  override remove(_item: DependencyLink): boolean {
    throw new Error('remove() prohibited');
  }

  /** Compaction is a no-op for DepSlotBuffer. */
  override compact(): void {}

  override truncateFrom(index: number): void {
    super.truncateFrom(index);
    if (this._map !== null) {
      this._map = null;
    }
  }

  /** Truncates the buffer and resets computed state indicators. */
  disposeAll(): void {
    this.truncateFrom(0);
    this.hasComputeds = false;
  }
}
