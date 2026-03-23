import { EPOCH_CONSTANTS } from '@/constants';

const _SLOT_CAPACITY = 4;

/**
 * Inline-slot subscriber container.
 *
 * Stores up to {@link _SLOT_CAPACITY} items directly as object properties
 * (zero array allocation). Spills to an overflow array only when the
 * inline slots are exhausted.
 *
 * Design goals:
 * - **Cache locality**: hot-path data lives on the same V8 object.
 * - **Logical deletion**: `remove()` nulls a slot and decrements `_count`.
 *   Physical compaction is deferred to `compact()`.
 * - **Epoch-aware reuse**: `clear()` resets `_count` to 0 without touching
 *   slot references; new `add()` calls overwrite stale pointers in-place.
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

  /** Last mutation epoch — used for staleness detection in `clear()`. */
  _epoch: number = EPOCH_CONSTANTS.UNINITIALIZED;

  /** Lazy-allocated overflow array for subscribers beyond {@link SLOT_CAPACITY}. */
  _overflow: (T | null)[] | null = null;

  // ── Public API ────────────────────────────────────────────────────────

  /** Number of active (non-null) elements. */
  get size(): number {
    return this._count;
  }

  /** Gets the item at a specific logical index. */
  getAt(index: number): T | null {
    if (index === 0) return this._s0;
    if (index === 1) return this._s1;
    if (index === 2) return this._s2;
    if (index === 3) return this._s3;

    if (this._overflow !== null && index >= 4 && index - 4 < this._overflow.length) {
      return this._overflow[index - 4] || null;
    }
    return null;
  }

  /** Overwrites an item at a specific index. */
  setAt(index: number, item: T | null): void {
    if (index === 0) {
      this._s0 = item;
    } else if (index === 1) {
      this._s1 = item;
    } else if (index === 2) {
      this._s2 = item;
    } else if (index === 3) {
      this._s3 = item;
    } else {
      if (this._overflow === null) {
        this._overflow = [];
      }
      this._overflow[index - 4] = item;
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
    if (index >= this._count) return;

    for (let i = index; i < this._count; i++) {
      let item: T | null = null;
      if (i === 0) {
        item = this._s0;
        this._s0 = null;
      } else if (i === 1) {
        item = this._s1;
        this._s1 = null;
      } else if (i === 2) {
        item = this._s2;
        this._s2 = null;
      } else if (i === 3) {
        item = this._s3;
        this._s3 = null;
      } else if (i >= 4 && this._overflow !== null) {
        item = this._overflow[i - 4] ?? null;
      }

      if (item !== null) {
        this._onItemRemoved(item);
      }
    }

    if (this._overflow !== null) {
      if (index <= 4) {
        this._overflow.length = 0;
        this._overflow = null;
      } else {
        this._overflow.length = index - 4;
      }
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
   * before spilling to the overflow array.
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

    // Overflow path
    if (this._overflow === null) {
      this._overflow = [item];
    } else {
      // Try to reuse a null gap in overflow before pushing
      const ov = this._overflow;
      for (let i = 0, len = ov.length; i < len; i++) {
        if (ov[i] === null) {
          ov[i] = item;
          this._count++;
          return;
        }
      }
      ov.push(item);
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
    // Inline slots
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

    // Overflow
    const ov = this._overflow;
    if (ov !== null) {
      for (let i = 0; i < ov.length; i++) {
        if (ov[i] === item) {
          ov[i] = null;
          this._count--;
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Checks whether {@link item} exists in the buffer (identity comparison).
   */
  has(item: T): boolean {
    if (this._s0 === item || this._s1 === item || this._s2 === item || this._s3 === item) {
      return true;
    }
    const ov = this._overflow;
    if (ov !== null) {
      for (let i = 0; i < ov.length; i++) {
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
    // Inline slots — always exactly 4 checks
    if (this._s0 !== null) fn(this._s0);
    if (this._s1 !== null) fn(this._s1);
    if (this._s2 !== null) fn(this._s2);
    if (this._s3 !== null) fn(this._s3);

    // Overflow
    const ov = this._overflow;
    if (ov !== null) {
      const len = ov.length;
      for (let i = 0; i < len; i++) {
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
    let executed = 0;
    if (this._s0 !== null) {
      fn(this._s0);
      executed++;
    }
    if (this._s1 !== null) {
      fn(this._s1);
      executed++;
    }
    if (this._s2 !== null) {
      fn(this._s2);
      executed++;
    }
    if (this._s3 !== null) {
      fn(this._s3);
      executed++;
    }

    const ov = this._overflow;
    if (ov !== null) {
      const len = ov.length;
      for (let i = 0; i < len; i++) {
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

    // Pop-and-swap compaction (matches original _cleanupTombstones logic)
    let i = 0;
    while (i < ov.length) {
      if (ov[i] === null) {
        const last = ov.pop() as T;
        if (i < ov.length && last != null) {
          ov[i] = last;
        }
      } else {
        i++;
      }
    }

    // Release overflow array when empty
    if (ov.length === 0) {
      this._overflow = null;
    }
  }

  /**
   * Logical clear — resets count without zeroing slot references.
   *
   * The stale references become invisible (count is 0, forEach yields
   * nothing after clear). Next `add()` overwrites them in-place.
   *
   * For a hard release (e.g. `dispose()`), use {@link dispose} instead.
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
  }

  /**
   * Hard dispose — releases all references for GC.
   */
  dispose(): void {
    this.clear();
  }
}
