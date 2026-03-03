import { beforeEach, describe, expect, it } from 'vitest';
import { ArrayPool } from '@/utils/array-pool';

describe('ArrayPool', () => {
  let pool: ArrayPool<number>;

  beforeEach(() => {
    pool = new ArrayPool<number>(4, 8);
  });

  // --------------------------------------------------------------------------
  // acquire
  // --------------------------------------------------------------------------

  describe('acquire', () => {
    it('should return a new empty array when pool is empty', () => {
      const arr = pool.acquire();
      expect(arr).toEqual([]);
      expect(arr).toBeInstanceOf(Array);
    });

    it('should return a previously released array (LIFO reuse)', () => {
      const original = [1, 2, 3];
      pool.release(original);

      const reused = pool.acquire();
      // Released arrays are cleared (length = 0), so it should be empty.
      expect(reused).toHaveLength(0);
      // Same reference was reused.
      expect(reused).toBe(original);
    });

    it('should return arrays in LIFO order', () => {
      const a: number[] = [];
      const b: number[] = [];
      const c: number[] = [];

      pool.release(a);
      pool.release(b);
      pool.release(c);

      expect(pool.acquire()).toBe(c);
      expect(pool.acquire()).toBe(b);
      expect(pool.acquire()).toBe(a);
    });
  });

  // --------------------------------------------------------------------------
  // release
  // --------------------------------------------------------------------------

  describe('release', () => {
    it('should clear the array before pooling', () => {
      const arr = [10, 20, 30];
      pool.release(arr);
      expect(arr).toHaveLength(0);
    });

    it('should reject arrays exceeding capacity', () => {
      // capacity = 8
      const big = new Array(9).fill(0);
      pool.release(big);
      // Big array was NOT pooled, so acquire gives a fresh one.
      const fresh = pool.acquire();
      expect(fresh).not.toBe(big);
    });

    it('should reject frozen arrays', () => {
      const frozen = Object.freeze([1, 2]) as number[];
      pool.release(frozen);

      const fresh = pool.acquire();
      expect(fresh).not.toBe(frozen);
    });

    it('should reject when pool is at limit', () => {
      // limit = 4
      for (let i = 0; i < 4; i++) {
        pool.release([i]);
      }
      const overflow: number[] = [99];
      pool.release(overflow);
      // overflow should NOT have been cleared since it wasn't accepted.
      expect(overflow).toEqual([99]);
    });

    it('should accept arrays at exactly the capacity boundary', () => {
      // capacity = 8
      const exact = new Array(8).fill(0);
      pool.release(exact);
      expect(pool.acquire()).toBe(exact);
    });
  });

  // --------------------------------------------------------------------------
  // reset
  // --------------------------------------------------------------------------

  describe('reset', () => {
    it('should drain all pooled arrays', () => {
      pool.release([1]);
      pool.release([2]);
      pool.release([3]);

      pool.reset();

      // After reset, acquire should return a fresh array.
      const fresh = pool.acquire();
      expect(fresh).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Integration: acquire–release cycle
  // --------------------------------------------------------------------------

  describe('acquire–release cycle', () => {
    it('should reuse arrays across multiple cycles', () => {
      const refs = new Set<number[]>();

      // Cycle 1: acquire 3 arrays
      for (let i = 0; i < 3; i++) {
        refs.add(pool.acquire());
      }
      expect(refs.size).toBe(3);

      // Release all
      for (const arr of refs) {
        arr.push(42);
        pool.release(arr);
      }

      // Cycle 2: acquire 3 again — should be the same 3 references
      const reused = new Set<number[]>();
      for (let i = 0; i < 3; i++) {
        reused.add(pool.acquire());
      }

      // All reused references should come from the original set.
      for (const r of reused) {
        expect(refs.has(r)).toBe(true);
        expect(r).toHaveLength(0); // cleared by release
      }
    });
  });
});
