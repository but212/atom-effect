/**
 * Logic: Bitwise Occupancy Table
 * Table for scan of the first free bit in a 4-bit mask.
 */
const FAST_CAPACITY = 4;

export class SlotBuffer<T> {
  /** Physical capacity including null gaps. Tracking this avoids unnecessary array scans. */
  #count = 0;

  /** Actual number of non-null items stored. Used for early-exit in iterations. */
  #actualCount = 0;

  /**
   * Optimization: 4-bit mask for fast-lane (0-3) occupancy.
   * bit i = 1 means _si is occupied.
   */
  #mask = 0;

  /** Fast-lane slots (separate fields for V8 hidden class optimization) */
  #s0: T | null = null;
  #s1: T | null = null;
  #s2: T | null = null;
  #s3: T | null = null;

  /** Overflow array for index >= 4 */
  #overflow: (T | null)[] | null = null;

  /** LIFO queue of vacated slot indices for reuse */
  #freeIndices: number[] = [];

  /**
   * Internal guard to prevent structural changes during iteration.
   * Logic: If > 0, compact() is deferred.
   */
  #lockCount = 0;
  #pendingCompact = false;

  /** Physical capacity (including null gaps). Safe for manual indexed loops. */
  get length(): number {
    return this.#count;
  }

  /** Logical size (number of non-null items). */
  get size(): number {
    return this.#actualCount;
  }

  /** Returns true if the buffer's structure is locked during iteration. */
  get isLocked(): boolean {
    return this.#lockCount > 0;
  }

  /**
   * Retrieves the item at the given index.
   * @returns The item, or null if the slot is empty or out of bounds.
   */
  at(index: number): T | null {
    if (index < FAST_CAPACITY) {
      return this.#getFast(index);
    }
    const ov = this.#overflow;
    return ov ? (ov[index - FAST_CAPACITY] ?? null) : null;
  }

  /** Return true if the buffer contains the given item. */
  has(item: T): boolean {
    if (this.#actualCount === 0) return false;

    const m = this.#mask;
    for (let i = 0; i < FAST_CAPACITY; i++) {
      if (m & (1 << i) && this.#getFast(i) === item) {
        return true;
      }
    }

    if (this.#count <= FAST_CAPACITY) return false;

    const ov = this.#overflow as (T | null)[];
    for (let i = 0, len = ov.length; i < len; i++) {
      if (ov[i] === item) return true;
    }
    return false;
  }

  /**
   * Iterates through all non-null items in order.
   * Optimization: Uses the occupancy mask to skip null slots in the fast lane.
   */
  forEach(fn: (item: T) => void): void {
    if (this.#actualCount === 0) return;

    this.lock();
    try {
      for (let i = 0; i < FAST_CAPACITY; i++) {
        if (this.#mask & (1 << i)) {
          fn(this.#getFast(i) as T);
        }
      }

      if (this.#count <= FAST_CAPACITY) return;

      const ov = this.#overflow as (T | null)[];
      for (let i = 0, len = ov.length; i < len; i++) {
        const item = ov[i];
        if (item != null) fn(item);
      }
    } finally {
      this.unlock();
    }
  }

  /**
   * Returns true if at least one item satisfies the predicate.
   */
  some(predicate: (item: T) => boolean): boolean {
    if (this.#actualCount === 0) return false;

    this.lock();
    try {
      for (let i = 0; i < FAST_CAPACITY; i++) {
        if (this.#mask & (1 << i) && predicate(this.#getFast(i) as T)) {
          return true;
        }
      }

      if (this.#count <= FAST_CAPACITY) return false;

      const ov = this.#overflow as (T | null)[];
      for (let i = 0, len = ov.length; i < len; i++) {
        const item = ov[i];
        if (item != null && predicate(item)) return true;
      }
      return false;
    } finally {
      this.unlock();
    }
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
    for (let i = 0; i < FAST_CAPACITY; i++) {
      if (m & (1 << i) && this.#getFast(i) === item) {
        return this.#removeAt(i);
      }
    }

    const ov = this.#overflow;
    if (ov) {
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === item) {
          return this.#removeAt(i + FAST_CAPACITY);
        }
      }
    }
    return false;
  }

  /**
   * Updates the item at a specific index.
   * Caution: Manual indexing can create gaps. Use compact() if order/density matters.
   */
  setAt(index: number, item: T | null): void {
    const old = this.at(index);
    if (old === item) return;

    if (item === null) {
      this.#removeAt(index);
    } else {
      this.#rawWrite(index, item);
      if (old === null) {
        this.#actualCount++;
      }
      if (index >= this.#count) {
        this.#count = index + 1;
      }
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
      this.#mask &= (1 << index) - 1;
      for (let i = index; i < FAST_CAPACITY; i++) {
        this.#setFast(i, null);
      }
      this.#overflow = null;
    } else {
      (this.#overflow as (T | null)[]).length = index - FAST_CAPACITY;
    }

    this.#count = index;
    this.#freeIndices = this.#freeIndices.filter((i) => i < index);
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
    const ov = this.#overflow;
    if (ov !== null) {
      if (writeIdx <= FAST_CAPACITY) this.#overflow = null;
      else ov.length = writeIdx - FAST_CAPACITY;
    }
    this.#freeIndices = [];
    this.#pendingCompact = false;
  }

  /** Iteration lock. */
  lock(): void {
    this.#lockCount++;
  }

  /** Iteration unlock. */
  unlock(): void {
    if (this.#lockCount <= 0) return;
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
    this.#freeIndices = [];
    this.#pendingCompact = false;
  }

  /** Alias for `clear`. */
  dispose(): void {
    this.clear();
  }

  /** Reads a fast-lane slot (0-3). */
  #getFast(index: number): T | null {
    if (index === 0) return this.#s0;
    if (index === 1) return this.#s1;
    if (index === 2) return this.#s2;
    return this.#s3;
  }

  /** Writes to a fast-lane slot (0-3). */
  #setFast(index: number, item: T | null): void {
    if (index === 0) this.#s0 = item;
    else if (index === 1) this.#s1 = item;
    else if (index === 2) this.#s2 = item;
    else this.#s3 = item;
  }

  /**
   * Logic: Low-level write that synchronizes the occupancy mask.
   * Caution: Does not update _actualCount or _count. Use setAt for high-level operations.
   */
  #rawWrite(index: number, item: T | null): void {
    if (index < FAST_CAPACITY) {
      const bit = 1 << index;
      if (item === null) {
        this.#mask &= ~bit;
      } else {
        this.#mask |= bit;
      }
      this.#setFast(index, item);
    } else {
      if (!this.#overflow) this.#overflow = [];
      this.#overflow[index - FAST_CAPACITY] = item;
    }
  }

  /** Logic: Finds a vacant slot using the free index stack or physical append. */
  #rawAdd(item: T): number {
    const reuseIdx = this.isLocked ? undefined : this.#freeIndices.pop();
    if (reuseIdx !== undefined) {
      this.#rawWrite(reuseIdx, item);
      return reuseIdx;
    }
    const nextIdx = this.#count;
    this.#rawWrite(nextIdx, item);
    return nextIdx;
  }

  /** Helper method to remove item at specific index. */
  #removeAt(index: number): boolean {
    this.#rawWrite(index, null);
    this.#actualCount--;
    this.#shrinkPhysicalSizeFrom(index);
    this.#freeIndices.push(index);
    return true;
  }

  /**
   * Optimization: Trims trailing nulls to keep iterations efficient.
   * Logic: Only triggers if the removed item was at the physical tail of the buffer.
   */
  #shrinkPhysicalSizeFrom(index: number): void {
    if (this.isLocked) return;
    if (index !== this.#count - 1) return;
    this.#count--;

    if (this.#count > FAST_CAPACITY) {
      const ov = this.#overflow as (T | null)[];
      while (this.#count > FAST_CAPACITY && ov[this.#count - (FAST_CAPACITY + 1)] == null) {
        this.#count--;
      }
    }

    if (this.#count <= FAST_CAPACITY) {
      // Bitwise Optimization:
      // Finds the 1-based index of the highest occupied bit in the fast lane mask.
      // Math.clz32 returns the number of leading zero bits of the 32-bit representation of the mask.
      // E.g., if mask is 00000000000000000000000000001000 (8), leading zeros is 28. 32 - 28 = 4.
      // if mask is 0, leading zeros is 32. 32 - 32 = 0.
      this.#count = 32 - Math.clz32(this.#mask);
    }
  }
}
