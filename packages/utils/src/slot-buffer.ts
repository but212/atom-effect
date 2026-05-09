/**
 * Table for scan of the first free bit in a 4-bit mask.
 */
const FIRST_FREE_INDEX = [0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, -1];
const FAST_CAPACITY = 4;
const FAST_MASK = 0b1111;

export class SlotBuffer<T> {
  /** Physical capacity including null gaps. Tracking this avoids unnecessary array scans. */
  protected _count: number;
  /** Actual number of non-null items stored. Used for early-exit in iterations. */
  protected _actualCount: number;

  /**
   * Optimization: 4-bit mask for fast-lane (0-3) occupancy.
   * bit i = 1 means _si is occupied.
   */
  protected _mask: number;

  protected _s0: T | null;
  protected _s1: T | null;
  protected _s2: T | null;
  protected _s3: T | null;

  protected _overflow: (T | null)[] | null;
  /** Logic: Tracks indices of null holes in the overflow array for O(1) reuse. */
  protected _freeIndices: number[] | null;

  /**
   * Internal guard to prevent structural changes during iteration.
   * Logic: If > 0, compact() is deferred.
   */
  protected _lockCount: number;
  protected _pendingCompact: boolean;

  constructor() {
    // Hidden Class Optimization: Initialize all fields in the constructor to ensure a stable shape.
    this._count = 0;
    this._actualCount = 0;
    this._mask = 0;
    this._s0 = null;
    this._s1 = null;
    this._s2 = null;
    this._s3 = null;
    this._overflow = null;
    this._freeIndices = null;
    this._lockCount = 0;
    this._pendingCompact = false;
  }

  /**
   * Optimization: Find the first free fast slot (0-3) using bit scanning.
   * @returns Index 0-3, or -1 if all fast slots are occupied.
   */
  protected _firstFreeSlot(mask: number): number {
    return FIRST_FREE_INDEX[mask & FAST_MASK]!;
  }

  /**
   * Logic: Low-level write that synchronizes the occupancy mask.
   * Caution: Does not update _actualCount or _count. Use setAt for high-level operations.
   */
  protected _rawWrite(index: number, item: T | null): void {
    if (index < FAST_CAPACITY) {
      const bit = 1 << index;
      if (item === null) this._mask &= ~bit;
      else this._mask |= bit;

      if (index === 0) this._s0 = item;
      else if (index === 1) this._s1 = item;
      else if (index === 2) this._s2 = item;
      else if (index === 3) this._s3 = item;
    } else {
      if (!this._overflow) this._overflow = [];
      this._overflow[index - FAST_CAPACITY] = item;
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
    if (!this._overflow) this._overflow = [];
    const ov = this._overflow;
    const free = this._freeIndices;
    if (free?.length) {
      const reuseIdx = free.pop()!;
      ov[reuseIdx] = item;
      return reuseIdx + FAST_CAPACITY;
    }

    ov.push(item);
    return FAST_CAPACITY - 1 + ov.length;
  }

  /** Swap the contents of two slots. */
  protected _rawSwap(idxA: number, idxB: number): void {
    if (idxA === idxB) return;
    const a = this.at(idxA);
    const b = this.at(idxB);
    this._rawWrite(idxA, b);
    this._rawWrite(idxB, a);
  }

  /** Physical capacity (including null gaps). Safe for manual indexed loops. */
  get length(): number {
    return this._count;
  }

  /** Logical size (number of non-null items). */
  get size(): number {
    return this._actualCount;
  }

  /**
   * Retrieves the item at the given index.
   * @returns The item, or null if the slot is empty or out of bounds.
   */
  at(index: number): T | null {
    if (index < FAST_CAPACITY) {
      if (index === 0) return this._s0;
      if (index === 1) return this._s1;
      if (index === 2) return this._s2;
      if (index === 3) return this._s3;
      return null;
    }
    const ov = this._overflow;
    return ov ? (ov[index - FAST_CAPACITY] ?? null) : null;
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

    if (this._count > FAST_CAPACITY) {
      const ov = this._overflow!;
      while (this._count > FAST_CAPACITY && ov[this._count - (FAST_CAPACITY + 1)] == null) {
        this._count--;
      }
    }

    if (this._count <= FAST_CAPACITY) {
      // Logic: Calculates highest bit set in the mask (e.g., mask 0b1010 -> count 4).
      this._count = 32 - Math.clz32(this._mask);
    }
  }

  /**
   * Efficiently clears all items from the given index to the end.
   */
  truncateFrom(index: number): void {
    const limit = this._count;
    if (index >= limit) return;

    for (let i = index; i < limit; i++) {
      if (this.at(i) !== null) this._actualCount--;
    }

    if (index < FAST_CAPACITY) {
      // Optimization: Clear mask and fast slots in one go using bitwise AND.
      this._mask &= (1 << index) - 1;
      if (index <= 0) this._s0 = null;
      if (index <= 1) this._s1 = null;
      if (index <= 2) this._s2 = null;
      if (index <= 3) this._s3 = null;
      this._overflow = null;
    } else if (this._overflow) {
      this._overflow.length = index - FAST_CAPACITY;
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
    if (m & 0b0001 && this._s0 === item) return this._removeAt(0);
    if (m & 0b0010 && this._s1 === item) return this._removeAt(1);
    if (m & 0b0100 && this._s2 === item) return this._removeAt(2);
    if (m & 0b1000 && this._s3 === item) return this._removeAt(3);

    const ov = this._overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) {
          ov[i] = null;
          this._actualCount--;
          this._shrinkPhysicalSizeFrom(i + FAST_CAPACITY);
          if (!this._freeIndices) this._freeIndices = [];
          this._freeIndices.push(i);
          return true;
        }
      }
    }
    return false;
  }

  protected _removeAt(index: number): boolean {
    this._rawWrite(index, null);
    this._actualCount--;
    this._shrinkPhysicalSizeFrom(index);
    return true;
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
   * Returns true if at least one item satisfies the predicate.
   */
  some(predicate: (item: T) => boolean): boolean {
    if (this._actualCount === 0) return false;

    const m = this._mask;
    if (m & 0b0001 && predicate(this._s0!)) return true;
    if (m & 0b0010 && predicate(this._s1!)) return true;
    if (m & 0b0100 && predicate(this._s2!)) return true;
    if (m & 0b1000 && predicate(this._s3!)) return true;

    const ov = this._overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const item = ov[i];
        if (item != null && predicate(item)) return true;
      }
    }
    return false;
  }

  /**
   * Removes all gaps and shifts items toward the front.
   */
  compact(): void {
    if (this._lockCount > 0) {
      this._pendingCompact = true;
      return;
    }

    const actual = this._actualCount;
    const currentCount = this._count;
    if (actual === currentCount) return;

    if (actual === 0) {
      this.clear();
      return;
    }

    let writeIdx = 0;
    const ov = this._overflow;

    for (let readIdx = 0; readIdx < currentCount; readIdx++) {
      const item = this.at(readIdx);
      if (item !== null) {
        if (readIdx !== writeIdx) {
          this._rawWrite(writeIdx, item);
          this._rawWrite(readIdx, null);
        }
        if (++writeIdx === actual) break;
      }
    }

    this._count = actual;
    if (ov !== null) {
      if (writeIdx <= FAST_CAPACITY) this._overflow = null;
      else ov.length = writeIdx - FAST_CAPACITY;
    }
    this._freeIndices = null;
    this._pendingCompact = false;
  }

  /** Iteration lock. */
  lock(): void {
    this._lockCount++;
  }

  /** Iteration unlock. */
  unlock(): void {
    if (--this._lockCount === 0 && this._pendingCompact) {
      this.compact();
    }
  }

  /** Reset the buffer to an empty state. */
  clear(): void {
    this._s0 = this._s1 = this._s2 = this._s3 = null;
    this._count = 0;
    this._actualCount = 0;
    this._mask = 0;
    this._overflow = null;
    this._freeIndices = null;
    this._pendingCompact = false;
  }

  /** Alias for `clear`. */
  dispose(): void {
    this.clear();
  }

  /** @internal */
  get isLocked(): boolean {
    return this._lockCount > 0;
  }
}
