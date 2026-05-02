/**
 * SlotBuffer: A high-performance, hybrid container optimized for reactive subscriber lists.
 *
 * DESIGN INTENT:
 * - Minimizes heap allocations for small collections (0-4 items) using "fast slots" (_s0-_s3).
 * - Scales to unbounded capacity using an overflow array when needed.
 * - Uses a 4-bit occupancy mask for O(1) vacancy checks in the fast lanes.
 *
 * WHEN TO USE:
 * - Managing dependency lists (atoms, observers) where most instances have 1-4 items.
 * - When O(1) removal of items by reference is required (via free-index tracking).
 */
export class SlotBuffer<T> {
  /** Physical capacity including null gaps. Tracking this avoids unnecessary array scans. */
  protected _count = 0;
  /** Actual number of non-null items stored. Used for early-exit in iterations. */
  protected _actualCount = 0;

  /**
   * Optimization: 4-bit mask for fast-lane (0-3) occupancy.
   * bit i = 1 means _si is occupied.
   */
  protected _mask = 0;

  protected _s0: T | null = null;
  protected _s1: T | null = null;
  protected _s2: T | null = null;
  protected _s3: T | null = null;

  protected _overflow: (T | null)[] | null = null;
  /** Logic: Tracks indices of null holes in the overflow array for O(1) reuse. */
  protected _freeIndices: number[] | null = null;

  /**
   * Optimization: Find the first free fast slot (0-3) using bit scanning.
   * @returns Index 0-3, or -1 if all fast slots are occupied.
   */
  protected _firstFreeSlot(mask: number): number {
    if ((mask & 0b0001) === 0) return 0;
    if ((mask & 0b0010) === 0) return 1;
    if ((mask & 0b0100) === 0) return 2;
    if ((mask & 0b1000) === 0) return 3;
    return -1;
  }

  /**
   * Logic: Low-level write that synchronizes the occupancy mask.
   * Caution: Does not update _actualCount or _count. Use setAt for high-level operations.
   */
  protected _rawWrite(index: number, item: T | null): void {
    if (index < 4) {
      const bit = 1 << index;
      if (item === null) this._mask &= ~bit;
      else this._mask |= bit;

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

  /** Logic: Finds a vacant slot (prioritizing fast lanes) and fills it. */
  protected _rawAdd(item: T): number {
    const mask = this._mask;
    const fastIdx = this._firstFreeSlot(mask);
    if (fastIdx !== -1) {
      this._mask = mask | (1 << fastIdx);
      if (fastIdx === 0) this._s0 = item;
      else if (fastIdx === 1) this._s1 = item;
      else if (fastIdx === 2) this._s2 = item;
      else this._s3 = item;
      return fastIdx;
    }

    if (this._overflow === null) this._overflow = [];
    const ov = this._overflow;
    const free = this._freeIndices;
    if (free?.length) {
      const reuseIdx = free.pop()!;
      ov[reuseIdx] = item;
      return reuseIdx + 4;
    }

    ov.push(item);
    return 3 + ov.length;
  }

  /** Swap the contents of two slots. */
  protected _rawSwap(idxA: number, idxB: number): void {
    if (idxA === idxB) return;
    const a = this.at(idxA);
    const b = this.at(idxB);
    this._rawWrite(idxA, b);
    this._rawWrite(idxB, a);
  }

  /** Number of non-null items stored. */
  get length(): number {
    return this._actualCount;
  }

  /** Physical capacity (including empty slots/holes). */
  get capacity(): number {
    return this._count;
  }

  /**
   * Retrieves the item at the given index.
   * @returns The item, or null if the slot is empty or out of bounds.
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
    return ov ? (ov[index - 4] ?? null) : null;
  }

  /**
   * Updates the item at a specific index.
   * Caution: Manual indexing can create gaps. Use compact() if order/density matters.
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
   * Optimization: Trims trailing nulls to keep iterations efficient.
   * Logic: Only triggers if the removed item was at the physical tail of the buffer.
   */
  protected _shrinkPhysicalSizeFrom(index: number): void {
    if (index !== this._count - 1) return;
    this._count--;

    if (this._count > 4) {
      const ov = this._overflow!;
      while (this._count > 4 && ov[this._count - 5] === null) {
        this._count--;
      }
    }

    if (this._count <= 4) {
      // Logic: Calculates highest bit set in the mask (e.g., mask 0b1010 -> count 4).
      this._count = 32 - Math.clz32(this._mask);
    }
  }

  /**
   * Efficiently clears all items from the given index to the end.
   *
   * @example
   * // Keep only the first 2 items
   * buffer.truncateFrom(2);
   */
  truncateFrom(index: number): void {
    const limit = this._count;
    if (index >= limit) return;

    for (let i = index; i < limit; i++) {
      const item = this.at(i);
      if (item !== null) {
        this._actualCount--;
      }
    }

    if (index < 4) {
      // Optimization: Clear mask and fast slots in one go using bitwise AND.
      this._mask &= (1 << index) - 1;
      if (index <= 0) this._s0 = null;
      if (index <= 1) this._s1 = null;
      if (index <= 2) this._s2 = null;
      if (index <= 3) this._s3 = null;
      this._overflow = null;
    } else if (this._overflow) {
      this._overflow.length = index - 4;
    }

    this._count = index;
    this._freeIndices = null;
  }

  /**
   * Adds an item to the first available hole or appends it.
   * @returns The index where the item was stored.
   */
  push(item: T): number {
    const idx = this._rawAdd(item);
    if (idx >= this._count) this._count = idx + 1;
    this._actualCount++;
    return idx;
  }

  /**
   * Removes an item by identity.
   * Optimization: Checks fast slots before scanning the overflow array.
   * @returns True if the item was found and removed.
   */
  remove(item: T): boolean {
    if (this._actualCount === 0) return false;

    const m = this._mask;
    if (m & 0b0001 && this._s0 === item) {
      this._rawWrite(0, null);
      this._actualCount--;
      this._shrinkPhysicalSizeFrom(0);
      return true;
    }
    if (m & 0b0010 && this._s1 === item) {
      this._rawWrite(1, null);
      this._actualCount--;
      this._shrinkPhysicalSizeFrom(1);
      return true;
    }
    if (m & 0b0100 && this._s2 === item) {
      this._rawWrite(2, null);
      this._actualCount--;
      this._shrinkPhysicalSizeFrom(2);
      return true;
    }
    if (m & 0b1000 && this._s3 === item) {
      this._rawWrite(3, null);
      this._actualCount--;
      this._shrinkPhysicalSizeFrom(3);
      return true;
    }

    const ov = this._overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) {
          ov[i] = null;
          this._actualCount--;
          this._shrinkPhysicalSizeFrom(i + 4);
          if (!this._freeIndices) this._freeIndices = [];
          this._freeIndices.push(i);
          return true;
        }
      }
    }
    return false;
  }

  /** Return true if the buffer contains the given item. */
  has(item: T): boolean {
    if (this._actualCount === 0) return false;

    const m = this._mask;
    if (m & 0b0001 && this._s0 === item) return true;
    if (m & 0b0010 && this._s1 === item) return true;
    if (m & 0b0100 && this._s2 === item) return true;
    if (m & 0b1000 && this._s3 === item) return true;

    const ov = this._overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) return true;
      }
    }
    return false;
  }

  /**
   * Iterates through all non-null items in order.
   * Optimization: Uses the occupancy mask to skip null slots in the fast lane.
   */
  forEach(fn: (item: T) => void): void {
    if (this._actualCount === 0) return;

    const m = this._mask;
    if (m & 0b0001) fn(this._s0!);
    if (m & 0b0010) fn(this._s1!);
    if (m & 0b0100) fn(this._s2!);
    if (m & 0b1000) fn(this._s3!);

    const ov = this._overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const item = ov[i];
        if (item != null) fn(item);
      }
    }
  }

  /**
   * Removes all gaps and shifts items toward the front.
   * Recommendation: Call this after multiple remove() operations to improve iteration speed.
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

  /** Reset the buffer to an empty state. */
  clear(): void {
    this._s0 = this._s1 = this._s2 = this._s3 = null;
    this._count = 0;
    this._actualCount = 0;
    this._mask = 0;
    this._overflow = null;
    this._freeIndices = null;
  }

  /** Alias for `clear`; kept for API compatibility. */
  dispose(): void {
    this.clear();
  }
}
