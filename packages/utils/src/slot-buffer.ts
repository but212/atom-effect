/**
 * Logic: Inline slots for fast-lane (0-3) and overflow array for index >= 4.
 */
const FAST_CAPACITY = 4;

export class SlotBuffer<T> {
  /** Physical capacity including null gaps. Tracking this avoids unnecessary array scans. */
  #count = 0;

  /** Actual number of non-null items stored. Used for early-exit in iterations. */
  #actualCount = 0;

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
    if (index === 0) return this.#s0;
    if (index === 1) return this.#s1;
    if (index === 2) return this.#s2;
    if (index === 3) return this.#s3;
    const ov = this.#overflow;
    if (ov !== null && index >= FAST_CAPACITY && index < this.#count) {
      return ov[index - FAST_CAPACITY] ?? null;
    }
    return null;
  }

  /** Return true if the buffer contains the given item. */
  has(item: T): boolean {
    if (this.#actualCount === 0) return false;

    if (this.#s0 === item) return true;
    if (this.#s1 === item) return true;
    if (this.#s2 === item) return true;
    if (this.#s3 === item) return true;

    const len = this.#count - FAST_CAPACITY;
    if (len <= 0) return false;

    const ov = this.#overflow;
    if (ov !== null) {
      for (let i = 0; i < len; i++) {
        if (ov[i] === item) return true;
      }
    }
    return false;
  }

  /**
   * Iterates through all non-null items in order.
   */
  forEach(fn: (item: T) => void): void {
    if (this.#actualCount === 0) return;

    this.lock();
    try {
      const s0 = this.#s0;
      if (s0 !== null) fn(s0);
      const s1 = this.#s1;
      if (s1 !== null) fn(s1);
      const s2 = this.#s2;
      if (s2 !== null) fn(s2);
      const s3 = this.#s3;
      if (s3 !== null) fn(s3);

      const len = this.#count - FAST_CAPACITY;
      if (len <= 0) return;

      const ov = this.#overflow;
      if (ov !== null) {
        for (let i = 0; i < len; i++) {
          const item = ov[i];
          if (item !== null && item !== undefined) fn(item);
        }
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
      const s0 = this.#s0;
      if (s0 !== null && predicate(s0)) return true;
      const s1 = this.#s1;
      if (s1 !== null && predicate(s1)) return true;
      const s2 = this.#s2;
      if (s2 !== null && predicate(s2)) return true;
      const s3 = this.#s3;
      if (s3 !== null && predicate(s3)) return true;

      const len = this.#count - FAST_CAPACITY;
      if (len <= 0) return false;

      const ov = this.#overflow;
      if (ov !== null) {
        for (let i = 0; i < len; i++) {
          const item = ov[i];
          if (item !== null && item !== undefined && predicate(item)) return true;
        }
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
   * @returns True if the item was found and removed.
   */
  remove(item: T): boolean {
    if (this.#actualCount === 0) return false;

    if (this.#s0 === item) return this.#removeAt(0);
    if (this.#s1 === item) return this.#removeAt(1);
    if (this.#s2 === item) return this.#removeAt(2);
    if (this.#s3 === item) return this.#removeAt(3);

    const len = this.#count - FAST_CAPACITY;
    if (len <= 0) return false;

    const ov = this.#overflow;
    if (ov !== null) {
      for (let i = 0; i < len; i++) {
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
      if (index <= 0) this.#s0 = null;
      if (index <= 1) this.#s1 = null;
      if (index <= 2) this.#s2 = null;
      if (index <= 3) this.#s3 = null;
      this.#overflow = null;
    } else if (this.#overflow !== null) {
      this.#overflow.length = index - FAST_CAPACITY;
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
    this.#overflow = null;
    this.#freeIndices = [];
    this.#pendingCompact = false;
  }

  /** Alias for `clear`. */
  dispose(): void {
    this.clear();
  }

  /** Writes to a slot (0+). */
  #rawWrite(index: number, item: T | null): void {
    if (index === 0) this.#s0 = item;
    else if (index === 1) this.#s1 = item;
    else if (index === 2) this.#s2 = item;
    else if (index === 3) this.#s3 = item;
    else {
      if (this.#overflow === null) this.#overflow = [];
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
      const ov = this.#overflow;
      if (ov !== null) {
        while (
          this.#count > FAST_CAPACITY &&
          (ov[this.#count - (FAST_CAPACITY + 1)] === null ||
            ov[this.#count - (FAST_CAPACITY + 1)] === undefined)
        ) {
          this.#count--;
        }
      }
    }

    if (this.#count <= FAST_CAPACITY) {
      if (this.#s3 !== null) this.#count = 4;
      else if (this.#s2 !== null) this.#count = 3;
      else if (this.#s1 !== null) this.#count = 2;
      else if (this.#s0 === null) this.#count = 0;
      else this.#count = 1;
    }
  }
}
