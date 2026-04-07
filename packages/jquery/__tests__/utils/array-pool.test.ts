import { beforeEach, describe, expect, it } from 'vitest';
import { ArrayPool } from '@/utils/pool';

describe('ArrayPool', () => {
  let pool: ArrayPool<number>;
  const LIMIT = 4;
  const CAPACITY = 8;

  beforeEach(() => {
    pool = new ArrayPool<number>(LIMIT, CAPACITY);
  });

  describe('Basic Acquisition & Reuse', () => {
    it('should provide empty arrays and reuse them in LIFO order', () => {
      // 1. Initial acquire is empty
      expect(pool.acquire()).toEqual([]);

      // 2. Release in sequence (a, then b)
      const a = [1];
      const b = [2];
      pool.release(a);
      pool.release(b);

      // 3. Acquire back (LIFO order: b first, then a)
      const first = pool.acquire();
      const second = pool.acquire();

      expect(first).toBe(b);
      expect(second).toBe(a);
      expect(second).toHaveLength(0); // cleared on release

      // 4. Exhausted pool returns fresh array
      expect(pool.acquire()).not.toBe(a);
      expect(pool.acquire()).toEqual([]);
    });
  });

  describe('Pooling Policies & Safety', () => {
    it('should always clear the array on release (GC hygiene)', () => {
      // 1. Normal case
      const normal = [1];
      pool.release(normal);
      expect(normal).toHaveLength(0);

      // 2. Rejected by capacity (still should clear)
      const big = new Array(CAPACITY + 1).fill(0);
      pool.release(big);
      expect(big).toHaveLength(0);

      // 3. Rejected by limit overflow (still should clear)
      for (let i = 0; i < LIMIT; i++) {
        pool.release([]);
      }
      const overflow = [99];
      pool.release(overflow);
      expect(overflow).toHaveLength(0);
    });

    it('should respect pooling limits and ignore invalid objects', () => {
      // Boundary check: 8 is accepted, 9 is rejected for pooling.
      const exact = new Array(CAPACITY).fill(0);
      const tooBig = new Array(CAPACITY + 1).fill(0);
      const frozen = Object.freeze([]) as unknown as number[];

      pool.release(exact);
      pool.release(tooBig);
      pool.release(frozen);

      // Only 'exact' should have been stored.
      expect(pool.acquire()).toBe(exact);
      expect(pool.acquire()).not.toBe(tooBig);
      expect(pool.acquire()).not.toBe(frozen);
    });

    it('should prevent double-pooling the same instance', () => {
      const arr: number[] = [];
      pool.release(arr);
      pool.release(arr);

      // Verify it only exists once in the pool
      expect(pool.acquire()).toBe(arr);
      expect(pool.acquire()).not.toBe(arr);
    });
  });

  describe('Management', () => {
    it('should clear all cached arrays on reset', () => {
      pool.release([1]);
      pool.reset();
      expect(pool.acquire()).toEqual([]);
    });
  });
});
