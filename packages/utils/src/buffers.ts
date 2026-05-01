/** SlotBuffer – a compact, high‑performance container for reactive subscribers.
 *
 *  The implementation keeps four fast slots (`_s0`‑`_s3`) that are tracked by a
 *  4‑bit mask (`_mask`).  All additional items are stored in a plain array
 *  (`_overflow`).  The mask enables O(1) checks for the fast lanes while the
 *  overflow array provides unbounded capacity.
 *
 *  This refactor keeps the original performance‑critical data structures but
 *  replaces the hard‑coded `FIRST_FREE` table with a tiny bit‑scan helper
 *  (`_firstFreeSlot`).  All public APIs are typed without `any` and contain
 *  minimal TSDoc comments where the intent may not be obvious.
 */
export class SlotBuffer<T> {
  /** Number of slots that physically exist (fast + overflow). */
  protected _count = 0;
  /** Number of non‑null entries currently stored. */
  protected _actualCount = 0;
  /** 4‑bit mask: bit 0‑3 indicate occupancy of _s0‑_s3. */
  protected _mask = 0;

  protected _s0: T | null = null;
  protected _s1: T | null = null;
  protected _s2: T | null = null;
  protected _s3: T | null = null;

  protected _overflow: (T | null)[] | null = null;
  protected _freeIndices: number[] | null = null;

  /** Find the first free fast slot (0‑3) or return -1 if none are free. */
  protected _firstFreeSlot(mask: number): number {
    if ((mask & 0b0001) === 0) return 0;
    if ((mask & 0b0010) === 0) return 1;
    if ((mask & 0b0100) === 0) return 2;
    if ((mask & 0b1000) === 0) return 3;
    return -1;
  }

  /** Write a value directly into a slot, updating the mask when necessary. */
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

  /** Add an item to the first available slot and return its index. */
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

  /** Number of non‑null items stored. */
  get length(): number {
    return this._actualCount;
  }

  /** Physical capacity (including empty slots). */
  get capacity(): number {
    return this._count;
  }

  /** Retrieve the item at a given index (null if empty). */
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

  /** Set the item at a specific index, updating counters and capacity. */
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

  /** Reduce physical size when the last slot becomes empty. */
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
      // Re‑calculate highest occupied fast‑slot using the mask.
      this._count = 32 - Math.clz32(this._mask);
    }
  }

  /** Remove all items from `index` onward, invoking `_onItemRemoved`. */
  truncateFrom(index: number): void {
    const limit = this._count;
    if (index >= limit) return;

    for (let i = index; i < limit; i++) {
      const item = this.at(i);
      if (item !== null) {
        this._onItemRemoved(item);
        this._actualCount--;
      }
    }

    if (index < 4) {
      // Clear fast‑lane mask and values up to `index`.
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

  /** Hook for subclasses – called when an item is removed via `truncateFrom`. */
  protected _onItemRemoved(_item: T): void {
    // No‑op in the base class.
  }

  /** Append an item to the buffer and return its index. */
  push(item: T): number {
    const idx = this._rawAdd(item);
    if (idx >= this._count) this._count = idx + 1;
    this._actualCount++;
    return idx;
  }

  /** Remove a specific item; returns true if the item was present. */
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

  /** Execute a callback for every non‑null entry, in order. */
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

  /** Remove gaps by moving all items toward the front of the buffer. */
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
