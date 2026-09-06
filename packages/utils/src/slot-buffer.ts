/**
 * Logic: Inline slots for fast-lane (0-3) and overflow array for index >= 4.
 */
const FAST_CAPACITY = 4;

export class SlotBuffer<T> {
  /** Physical capacity including null gaps. Tracking this avoids unnecessary array scans. */
  #physicalCapacity = 0;

  /** Actual number of non-null items stored. Used for early-exit in iterations. */
  #activeItemsCount = 0;

  /** Fast-lane slots (separate fields for V8 hidden class optimization) */
  #fastSlot0: T | null = null;
  #fastSlot1: T | null = null;
  #fastSlot2: T | null = null;
  #fastSlot3: T | null = null;

  /** Overflow array for index >= 4 */
  #overflowBuffer: (T | null)[] | null = null;

  /** LIFO queue of vacated slot indices for reuse */
  #freeIndices: number[] = [];

  /**
   * Internal guard to prevent structural changes during iteration.
   * Logic: If > 0, compact() is deferred.
   */
  #lockCount = 0;
  #hasPendingCompact = false;

  /** Physical capacity (including null gaps). Safe for manual indexed loops. */
  get length(): number {
    return this.#physicalCapacity;
  }

  /** Logical size (number of non-null items). */
  get size(): number {
    return this.#activeItemsCount;
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
      if (index === 0) return this.#fastSlot0;
      if (index === 1) return this.#fastSlot1;
      if (index === 2) return this.#fastSlot2;
      if (index === 3) return this.#fastSlot3;
    } else {
      const overflowBuffer = this.#overflowBuffer;
      if (overflowBuffer !== null && index < this.#physicalCapacity) {
        return overflowBuffer[index - FAST_CAPACITY] ?? null;
      }
    }
    return null;
  }

  /** Return true if the buffer contains the given item. */
  has(item: T): boolean {
    if (item === null || item === undefined) return false;
    if (this.#activeItemsCount === 0) return false;

    if (this.#fastSlot0 === item) return true;
    if (this.#fastSlot1 === item) return true;
    if (this.#fastSlot2 === item) return true;
    if (this.#fastSlot3 === item) return true;

    const overflowCount = this.#physicalCapacity - FAST_CAPACITY;
    if (overflowCount <= 0) return false;

    const overflowBuffer = this.#overflowBuffer;
    if (overflowBuffer !== null) {
      for (let i = 0; i < overflowCount; i++) {
        if (overflowBuffer[i] === item) return true;
      }
    }
    return false;
  }

  /**
   * Iterates through all non-null items in order.
   */
  forEach(callback: (item: T) => void): void {
    if (this.#activeItemsCount === 0) return;

    this.lock();
    try {
      const s0 = this.#fastSlot0;
      if (s0 !== null) callback(s0);
      const s1 = this.#fastSlot1;
      if (s1 !== null) callback(s1);
      const s2 = this.#fastSlot2;
      if (s2 !== null) callback(s2);
      const s3 = this.#fastSlot3;
      if (s3 !== null) callback(s3);

      for (let i = 0; i < this.#physicalCapacity - FAST_CAPACITY; i++) {
        const item = this.#overflowBuffer?.[i];
        if (item !== null && item !== undefined) callback(item);
      }
    } finally {
      this.unlock();
    }
  }

  /**
   * Returns true if at least one item satisfies the predicate.
   */
  some(predicate: (item: T) => boolean): boolean {
    if (this.#activeItemsCount === 0) return false;

    this.lock();
    try {
      const s0 = this.#fastSlot0;
      if (s0 !== null && predicate(s0)) return true;
      const s1 = this.#fastSlot1;
      if (s1 !== null && predicate(s1)) return true;
      const s2 = this.#fastSlot2;
      if (s2 !== null && predicate(s2)) return true;
      const s3 = this.#fastSlot3;
      if (s3 !== null && predicate(s3)) return true;

      for (let i = 0; i < this.#physicalCapacity - FAST_CAPACITY; i++) {
        const item = this.#overflowBuffer?.[i];
        if (item !== null && item !== undefined && predicate(item)) return true;
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
    const storedIndex = this.#rawAdd(item);
    if (storedIndex >= this.#physicalCapacity) this.#physicalCapacity = storedIndex + 1;
    this.#activeItemsCount++;
    return storedIndex;
  }

  /**
   * Removes an item by identity.
   * @returns True if the item was found and removed.
   */
  remove(item: T): boolean {
    if (item === null || item === undefined) return false;
    if (this.#activeItemsCount === 0) return false;

    if (this.#fastSlot0 === item) return this.#removeAt(0);
    if (this.#fastSlot1 === item) return this.#removeAt(1);
    if (this.#fastSlot2 === item) return this.#removeAt(2);
    if (this.#fastSlot3 === item) return this.#removeAt(3);

    const overflowCount = this.#physicalCapacity - FAST_CAPACITY;
    if (overflowCount <= 0) return false;

    const overflowBuffer = this.#overflowBuffer;
    if (overflowBuffer !== null) {
      for (let i = 0; i < overflowCount; i++) {
        if (overflowBuffer[i] === item) {
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
    const previousItem = this.at(index);
    if (previousItem === item) return;

    if (item === null) {
      this.#removeAt(index);
    } else {
      this.#rawWrite(index, item);
      if (previousItem === null) {
        this.#activeItemsCount++;
      }
      if (index >= this.#physicalCapacity) {
        this.#physicalCapacity = index + 1;
      }
    }
  }

  truncateFrom(index: number): void {
    const physicalCapacityLimit = this.#physicalCapacity;
    if (index >= physicalCapacityLimit) return;

    for (let i = index; i < physicalCapacityLimit; i++) {
      if (this.at(i) !== null) {
        this.#activeItemsCount--;
      }
    }

    const fastCapacityLimit = Math.min(physicalCapacityLimit, FAST_CAPACITY);
    for (let i = index; i < fastCapacityLimit; i++) {
      this.#rawWrite(i, null);
    }

    if (index <= FAST_CAPACITY) {
      this.#overflowBuffer = null;
    } else if (this.#overflowBuffer !== null) {
      this.#overflowBuffer.length = index - FAST_CAPACITY;
    }

    this.#physicalCapacity = index;
    this.#freeIndices = this.#freeIndices.filter((i) => i < index);
  }

  /**
   * Removes all gaps and shifts items toward the front.
   */
  compact(): void {
    if (this.#lockCount > 0) {
      this.#hasPendingCompact = true;
      return;
    }

    const activeItemsCount = this.#activeItemsCount;
    const physicalCapacityCount = this.#physicalCapacity;
    if (activeItemsCount === physicalCapacityCount) return;

    if (activeItemsCount === 0) {
      this.clear();
      return;
    }

    let writeIndex = 0;
    for (let readIndex = 0; readIndex < physicalCapacityCount; readIndex++) {
      const item = this.at(readIndex);
      if (item !== null) {
        if (readIndex !== writeIndex) {
          this.#rawWrite(writeIndex, item);
          this.#rawWrite(readIndex, null);
        }
        if (++writeIndex === activeItemsCount) break;
      }
    }

    this.#physicalCapacity = activeItemsCount;
    const ov = this.#overflowBuffer;
    if (ov !== null) {
      if (writeIndex <= FAST_CAPACITY) this.#overflowBuffer = null;
      else ov.length = writeIndex - FAST_CAPACITY;
    }
    this.#freeIndices.length = 0;
    this.#hasPendingCompact = false;
  }

  /** Iteration lock. */
  lock(): void {
    this.#lockCount++;
  }

  /** Iteration unlock. */
  unlock(): void {
    if (this.#lockCount <= 0) return;
    if (--this.#lockCount === 0 && this.#hasPendingCompact) {
      this.compact();
    }
  }

  /** Reset the buffer to an empty state. */
  clear(): void {
    this.#fastSlot0 = this.#fastSlot1 = this.#fastSlot2 = this.#fastSlot3 = null;
    this.#physicalCapacity = 0;
    this.#activeItemsCount = 0;
    this.#overflowBuffer = null;
    this.#freeIndices.length = 0;
    this.#hasPendingCompact = false;
  }

  /** Alias for `clear`. */
  dispose(): void {
    this.clear();
  }

  #rawWrite(index: number, item: T | null): void {
    if (index < FAST_CAPACITY) {
      if (index === 0) this.#fastSlot0 = item;
      else if (index === 1) this.#fastSlot1 = item;
      else if (index === 2) this.#fastSlot2 = item;
      else this.#fastSlot3 = item;
    } else {
      if (this.#overflowBuffer === null) this.#overflowBuffer = [];
      this.#overflowBuffer[index - FAST_CAPACITY] = item;
    }
  }

  /** Logic: Finds a vacant slot using the free index stack or physical append. */
  #rawAdd(item: T): number {
    const reusableIndex = this.isLocked ? undefined : this.#freeIndices.pop();
    if (reusableIndex !== undefined) {
      this.#rawWrite(reusableIndex, item);
      return reusableIndex;
    }
    const nextSlotIndex = this.#physicalCapacity;
    this.#rawWrite(nextSlotIndex, item);
    return nextSlotIndex;
  }

  /** Helper method to remove item at specific index. */
  #removeAt(index: number): boolean {
    this.#rawWrite(index, null);
    this.#activeItemsCount--;
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
    if (index !== this.#physicalCapacity - 1) return;

    while (this.#physicalCapacity > 0 && this.at(this.#physicalCapacity - 1) === null) {
      this.#physicalCapacity--;
    }
    if (this.#physicalCapacity <= FAST_CAPACITY) {
      this.#overflowBuffer = null;
    } else if (this.#overflowBuffer !== null) {
      this.#overflowBuffer.length = this.#physicalCapacity - FAST_CAPACITY;
    }
  }
}
