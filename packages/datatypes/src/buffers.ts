/**
 * An optimized container for managing reactive subscribers with minimal allocations.
 *
 * When to use:
 * - As internal storage for subscribers or dependencies within reactive nodes.
 * - In performance-critical paths where frequent array allocations should be avoided.
 */
export class SlotBuffer<T> {
  _count = 0;
  _actualCount = 0;

  _s0: T | null = null;
  _s1: T | null = null;
  _s2: T | null = null;
  _s3: T | null = null;

  _overflow: (T | null)[] | null = null;
  _freeIndices: number[] | null = null;

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

  protected _rawSwap(idxA: number, idxB: number): void {
    if (idxA === idxB) return;
    const valA = this.at(idxA);
    const valB = this.at(idxB);
    this._rawWrite(idxA, valB);
    this._rawWrite(idxB, valA);
  }

  get length(): number {
    return this._actualCount;
  }
  get capacity(): number {
    return this._count;
  }

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

  protected _onItemRemoved(_item: T): void {}

  push(item: T): number {
    const idx = this._rawAdd(item);
    if (idx >= this._count) this._count = idx + 1;
    this._actualCount++;
    return idx;
  }

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

  has(item: T): boolean {
    const actual = this._actualCount;
    if (actual === 0) return false;
    if (this._s0 === item || this._s1 === item || this._s2 === item || this._s3 === item)
      return true;
    const ov = this._overflow;
    if (ov !== null) return ov.indexOf(item) !== -1;
    return false;
  }

  forEach(fn: (item: T) => void): void {
    const actual = this._actualCount;
    if (actual === 0) return;

    if (actual === this._count) {
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
