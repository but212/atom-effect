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

  /** Gets the item at a specific logical index. */
  getAt(index: number): T | null {
    switch (index) {
      case 0:
        return this._s0;
      case 1:
        return this._s1;
      case 2:
        return this._s2;
      case 3:
        return this._s3;
      default: {
        const ov = this._overflow;
        if (ov !== null && index >= 4) {
          const ovIdx = index - 4;
          if (ovIdx < ov.length) return ov[ovIdx] ?? null;
        }
        return null;
      }
    }
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
        const ov = this._overflow;
        ov[index - 4] = item;
      }
    }

    if (index >= this._count) {
      this._count = index + 1;
    }
  }

  /**
   * Discards all items from the given index onwards.
   * Equivalent to resetting the length of an array.
   */
  truncateFrom(index: number): void {
    const count = this._count;
    if (index >= count) return;

    // 1. Unroll Inline Slots Cleanup
    // Uses fallthrough logic to clean up all slots from the given index onwards.
    if (index <= 3) {
      switch (index) {
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for range cleanup
        case 0: {
          const s = this._s0;
          if (s != null) {
            this._onItemRemoved(s);
            this._s0 = null;
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for range cleanup
        case 1: {
          const s = this._s1;
          if (s != null) {
            this._onItemRemoved(s);
            this._s1 = null;
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for range cleanup
        case 2: {
          const s = this._s2;
          if (s != null) {
            this._onItemRemoved(s);
            this._s2 = null;
          }
        }
        case 3: {
          const s = this._s3;
          if (s != null) {
            this._onItemRemoved(s);
            this._s3 = null;
          }
        }
      }
    }

    // 2. Overflow Cleanup
    const ov = this._overflow;
    if (ov !== null && count > 4) {
      const startIdx = index > 4 ? index - 4 : 0;
      const len = ov.length;
      for (let i = startIdx; i < len; i++) {
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
    if (this._overflow === null) {
      this._overflow = [item];
    } else {
      const free = this._freeIndices;
      if (free !== null && free.length > 0) {
        // O(1) reuse of a previously-freed overflow slot
        this._overflow[free.pop()!] = item;
      } else {
        this._overflow.push(item);
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
        (this._freeIndices ??= []).push(i);
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether {@link item} exists in the buffer (identity comparison).
   */
  has(item: T): boolean {
    if (this._count === 0) return false;

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
    if (this._count === 0) return;

    // 1. Inline slots
    const s0 = this._s0;
    if (s0 != null) fn(s0);
    const s1 = this._s1;
    if (s1 != null) fn(s1);
    const s2 = this._s2;
    if (s2 != null) fn(s2);
    const s3 = this._s3;
    if (s3 != null) fn(s3);

    // 2. Overflow
    const ov = this._overflow;
    if (ov != null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const el = ov[i];
        if (el != null) fn(el);
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
      executed++;
    }
    const s1 = this._s1;
    if (s1 != null) {
      fn(s1);
      executed++;
    }
    const s2 = this._s2;
    if (s2 != null) {
      fn(s2);
      executed++;
    }
    const s3 = this._s3;
    if (s3 != null) {
      fn(s3);
      executed++;
    }

    // Fast exit
    if (executed === count) return executed;

    // 2. Overflow
    const ov = this._overflow;
    if (ov != null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const el = ov[i];
        if (el != null) {
          fn(el);
          executed++;
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
    if (ov === null || ov.length === 0) return;

    // Pop-and-swap compaction with proper null handling
    let i = 0;
    while (i < ov.length) {
      if (ov[i] === null) {
        // Pop trailing nulls first to find a valid swap candidate
        while (ov.length > i && ov[ov.length - 1] === null) {
          ov.pop();
        }
        // If there's still a valid element beyond i, swap it in
        if (ov.length > i) {
          ov[i] = ov.pop()!;
          i++;
        }
      } else {
        i++;
      }
    }

    // Invalidate free indices after compaction (positions have shifted)
    this._freeIndices = null;

    // Release overflow array when empty
    if (ov.length === 0) {
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
