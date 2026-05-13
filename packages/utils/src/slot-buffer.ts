/**
 * Logic: Bitwise Occupancy Table
 * Table for scan of the first free bit in a 4-bit mask.
 */
const FAST_CAPACITY = 4;
const FAST_MASK = 0b1111;

export class SlotBuffer<T> {
  static readonly #FIRST_FREE_INDEX = [
    0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, -1,
  ] as const satisfies readonly number[];

  /** Physical capacity including null gaps. Tracking this avoids unnecessary array scans. */
  #count = 0;
  /** Actual number of non-null items stored. Used for early-exit in iterations. */
  #actualCount = 0;

  /**
   * Optimization: 4-bit mask for fast-lane (0-3) occupancy.
   * bit i = 1 means _si is occupied.
   */
  #mask = 0;

  #s0: T | null = null;
  #s1: T | null = null;
  #s2: T | null = null;
  #s3: T | null = null;

  #overflow: (T | null)[] | null = null;
  /** Logic: Tracks indices of null holes in the overflow array for O(1) reuse. */
  #freeIndices: number[] | null = null;

  /**
   * Internal guard to prevent structural changes during iteration.
   * Logic: If > 0, compact() is deferred.
   */
  #lockCount = 0;
  #pendingCompact = false;

  /**
   * Optimization: Find the first free fast slot (0-3) using bit scanning.
   * @returns Index 0-3, or -1 if all fast slots are occupied.
   */
  #firstFreeSlot(mask: number): number {
    return SlotBuffer.#FIRST_FREE_INDEX[mask & FAST_MASK]!;
  }

  /**
   * Logic: Low-level write that synchronizes the occupancy mask.
   * Caution: Does not update _actualCount or _count. Use setAt for high-level operations.
   */
  #rawWrite(index: number, item: T | null): void {
    if (index < FAST_CAPACITY) {
      const bit = 1 << index;
      if (item === null) this.#mask &= ~bit;
      else this.#mask |= bit;

      if (index === 0) this.#s0 = item;
      else if (index === 1) this.#s1 = item;
      else if (index === 2) this.#s2 = item;
      else if (index === 3) this.#s3 = item;
    } else {
      if (!this.#overflow) this.#overflow = [];
      this.#overflow[index - FAST_CAPACITY] = item;
    }
  }

  /** Logic: Finds a vacant slot (prioritizing fast lanes) and fills it. */
  #rawAdd(item: T): number {
    const mask = this.#mask;
    const fastIdx = this.#firstFreeSlot(mask);
    if (fastIdx !== -1) {
      this.#mask = mask | (1 << fastIdx);
      if (fastIdx === 0) this.#s0 = item;
      else if (fastIdx === 1) this.#s1 = item;
      else if (fastIdx === 2) this.#s2 = item;
      else this.#s3 = item;
      return fastIdx;
    }
    if (!this.#overflow) this.#overflow = [];
    const ov = this.#overflow;
    const free = this.#freeIndices;
    if (free?.length) {
      const reuseIdx = free.pop()!;
      ov[reuseIdx] = item;
      return reuseIdx + FAST_CAPACITY;
    }

    ov.push(item);
    return FAST_CAPACITY - 1 + ov.length;
  }

  /** Swap the contents of two slots. */
  #rawSwap(idxA: number, idxB: number): void {
    if (idxA === idxB) return;
    const a = this.at(idxA);
    const b = this.at(idxB);
    this.#rawWrite(idxA, b);
    this.#rawWrite(idxB, a);
  }

  /** Physical capacity (including null gaps). Safe for manual indexed loops. */
  get length(): number {
    return this.#count;
  }

  /** Logical size (number of non-null items). */
  get size(): number {
    return this.#actualCount;
  }

  /**
   * Retrieves the item at the given index.
   * @returns The item, or null if the slot is empty or out of bounds.
   */
  at(index: number): T | null {
    if (index < FAST_CAPACITY) {
      if (index === 0) return this.#s0;
      if (index === 1) return this.#s1;
      if (index === 2) return this.#s2;
      if (index === 3) return this.#s3;
      return null;
    }
    const ov = this.#overflow;
    return ov ? (ov[index - FAST_CAPACITY] ?? null) : null;
  }

  /**
   * Updates the item at a specific index.
   * Caution: Manual indexing can create gaps. Use compact() if order/density matters.
   */
  setAt(index: number, item: T | null): void {
    const old = this.at(index);
    if (old === item) return;

    this.#rawWrite(index, item);

    if (old === null) this.#actualCount++;
    else if (item === null) this.#actualCount--;

    if (item !== null) {
      if (index >= this.#count) this.#count = index + 1;
    } else {
      this.#shrinkPhysicalSizeFrom(index);
    }
  }

  /**
   * Optimization: Trims trailing nulls to keep iterations efficient.
   * Logic: Only triggers if the removed item was at the physical tail of the buffer.
   */
  #shrinkPhysicalSizeFrom(index: number): void {
    if (index !== this.#count - 1) return;
    this.#count--;

    if (this.#count > FAST_CAPACITY) {
      const ov = this.#overflow!;
      while (this.#count > FAST_CAPACITY && ov[this.#count - (FAST_CAPACITY + 1)] == null) {
        this.#count--;
      }
    }

    if (this.#count <= FAST_CAPACITY) {
      // Logic: Calculates highest bit set in the mask (e.g., mask 0b1010 -> count 4).
      this.#count = 32 - Math.clz32(this.#mask);
    }
  }

  /**
   * Efficiently clears all items from the given index to the end.
   */
  truncateFrom(index: number): void {
    const limit = this.#count;
    if (index >= limit) return;

    for (let i = index; i < limit; i++) {
      if (this.at(i) !== null) this.#actualCount--;
    }

    if (index < FAST_CAPACITY) {
      // Optimization: Clear mask and fast slots in one go using bitwise AND.
      this.#mask &= (1 << index) - 1;
      if (index <= 0) this.#s0 = null;
      if (index <= 1) this.#s1 = null;
      if (index <= 2) this.#s2 = null;
      if (index <= 3) this.#s3 = null;
      this.#overflow = null;
    } else if (this.#overflow) {
      this.#overflow.length = index - FAST_CAPACITY;
    }

    this.#count = index;
    this.#freeIndices = null;
  }

  /**
   * Adds an item to the first available hole or appends it.
   * @returns The index where the item was stored.
   */
  push(item: T): number {
    const idx = this.#rawAdd(item);
    if (idx >= this.#count) this.#count = idx + 1;
    this.#actualCount++;
    return idx;
  }

  /**
   * Removes an item by identity.
   * Optimization: Checks fast slots before scanning the overflow array.
   * @returns True if the item was found and removed.
   */
  remove(item: T): boolean {
    if (this.#actualCount === 0) return false;

    const m = this.#mask;
    if (m & 0b0001 && this.#s0 === item) return this.#removeAt(0);
    if (m & 0b0010 && this.#s1 === item) return this.#removeAt(1);
    if (m & 0b0100 && this.#s2 === item) return this.#removeAt(2);
    if (m & 0b1000 && this.#s3 === item) return this.#removeAt(3);

    const ov = this.#overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) {
          ov[i] = null;
          this.#actualCount--;
          this.#shrinkPhysicalSizeFrom(i + FAST_CAPACITY);
          if (!this.#freeIndices) this.#freeIndices = [];
          this.#freeIndices.push(i);
          return true;
        }
      }
    }
    return false;
  }

  #removeAt(index: number): boolean {
    this.#rawWrite(index, null);
    this.#actualCount--;
    this.#shrinkPhysicalSizeFrom(index);
    return true;
  }

  /** Return true if the buffer contains the given item. */
  has(item: T): boolean {
    if (this.#actualCount === 0) return false;

    const m = this.#mask;
    if (m & 0b0001 && this.#s0 === item) return true;
    if (m & 0b0010 && this.#s1 === item) return true;
    if (m & 0b0100 && this.#s2 === item) return true;
    if (m & 0b1000 && this.#s3 === item) return true;

    const ov = this.#overflow;
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
    if (this.#actualCount === 0) return;

    const m = this.#mask;
    if (m & 0b0001) fn(this.#s0!);
    if (m & 0b0010) fn(this.#s1!);
    if (m & 0b0100) fn(this.#s2!);
    if (m & 0b1000) fn(this.#s3!);

    const ov = this.#overflow;
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
    if (this.#actualCount === 0) return false;

    const m = this.#mask;
    if (m & 0b0001 && predicate(this.#s0!)) return true;
    if (m & 0b0010 && predicate(this.#s1!)) return true;
    if (m & 0b0100 && predicate(this.#s2!)) return true;
    if (m & 0b1000 && predicate(this.#s3!)) return true;

    const ov = this.#overflow;
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
    if (this.#lockCount > 0) {
      this.#pendingCompact = true;
      return;
    }

    const actual = this.#actualCount;
    const currentCount = this.#count;
    if (actual === currentCount) return;

    if (actual === 0) {
      this.clear();
      return;
    }

    let writeIdx = 0;
    const ov = this.#overflow;

    for (let readIdx = 0; readIdx < currentCount; readIdx++) {
      const item = this.at(readIdx);
      if (item !== null) {
        if (readIdx !== writeIdx) {
          this.#rawWrite(writeIdx, item);
          this.#rawWrite(readIdx, null);
        }
        if (++writeIdx === actual) break;
      }
    }

    this.#count = actual;
    if (ov !== null) {
      if (writeIdx <= FAST_CAPACITY) this.#overflow = null;
      else ov.length = writeIdx - FAST_CAPACITY;
    }
    this.#freeIndices = null;
    this.#pendingCompact = false;
  }

  /** Iteration lock. */
  lock(): void {
    this.#lockCount++;
  }

  /** Iteration unlock. */
  unlock(): void {
    if (--this.#lockCount === 0 && this.#pendingCompact) {
      this.compact();
    }
  }

  /** Reset the buffer to an empty state. */
  clear(): void {
    this.#s0 = this.#s1 = this.#s2 = this.#s3 = null;
    this.#count = 0;
    this.#actualCount = 0;
    this.#mask = 0;
    this.#overflow = null;
    this.#freeIndices = null;
    this.#pendingCompact = false;
  }

  /** Alias for `clear`. */
  dispose(): void {
    this.clear();
  }

  get isLocked(): boolean {
    return this.#lockCount > 0;
  }
}
