import { beforeEach, describe, expect, it } from 'vitest';
import type { DependencyLink } from '@/core/dep-tracking';
import { EMPTY_LINKS, linksArrayPool } from '@/internal/pool';
import { ArrayPool } from '@/utils/array-pool';

describe('ArrayPool', () => {
  beforeEach(() => {
    linksArrayPool.reset();
  });

  describe('acquire & release', () => {
    it('returns new empty arrays and populates stats', () => {
      const a = linksArrayPool.acquire();
      const b = linksArrayPool.acquire();

      expect(a).toEqual([]);
      expect(a).not.toBe(b);
      expect(linksArrayPool.getStats()?.acquired).toBe(2);
    });

    it('reuses released arrays in LIFO order and clears contents', () => {
      const a = linksArrayPool.acquire();
      const b = linksArrayPool.acquire();
      (a as unknown as number[]).push(1);
      (b as unknown as number[]).push(2);

      linksArrayPool.release(a);
      linksArrayPool.release(b);

      const reusedB = linksArrayPool.acquire();
      const reusedA = linksArrayPool.acquire();

      expect(reusedB).toBe(b);
      expect(reusedA).toBe(a);
      expect(reusedB).toHaveLength(0); // cleared content
      expect(linksArrayPool.getStats()?.released).toBe(2);
    });
  });

  describe('rejections constraints', () => {
    it('ignores EMPTY_LINKS constant without updating stats', () => {
      linksArrayPool.release(EMPTY_LINKS as unknown as DependencyLink[], EMPTY_LINKS);
      const stats = linksArrayPool.getStats();
      expect(stats?.released).toBe(0);
      expect(stats?.poolSize).toBe(0);
    });

    it('rejects arrays larger than max capacity boundary (256)', () => {
      const boundaryArr = new Array(256).fill(null);
      const overLargeArr = new Array(257).fill(null);

      linksArrayPool.release(boundaryArr as unknown as DependencyLink[]);
      expect(linksArrayPool.getStats()?.rejected.tooLarge).toBe(0);

      linksArrayPool.release(overLargeArr as unknown as DependencyLink[]);
      expect(linksArrayPool.getStats()?.rejected.tooLarge).toBe(1);
      expect(linksArrayPool.getStats()?.poolSize).toBe(1); // Only boundary added
    });

    it('rejects frozen arrays', () => {
      linksArrayPool.release(Object.freeze([]) as unknown as DependencyLink[]);
      expect(linksArrayPool.getStats()?.rejected.frozen).toBe(1);
      expect(linksArrayPool.getStats()?.poolSize).toBe(0);
    });

    it('rejects arrays when pool is full (over max 50)', () => {
      const arrays = Array.from({ length: 51 }, () => linksArrayPool.acquire());
      arrays.forEach((arr) => linksArrayPool.release(arr));

      const stats = linksArrayPool.getStats();
      expect(stats?.poolSize).toBe(50);
      expect(stats?.rejected.poolFull).toBe(1);
    });
  });

  describe('stats & lifecycle', () => {
    it('calculates leaked arrays correctly', () => {
      expect(linksArrayPool.getStats()?.leaked).toBe(0);
      linksArrayPool.acquire();
      linksArrayPool.acquire();
      linksArrayPool.release(linksArrayPool.acquire());
      expect(linksArrayPool.getStats()?.leaked).toBe(2);
    });

    it('returns a snapshot that does not mutate internal state', () => {
      const stats = linksArrayPool.getStats()!;
      stats.rejected.frozen = 999;
      expect(linksArrayPool.getStats()?.rejected.frozen).toBe(0);
    });

    it('completely resets pool arrays and all trackable stats', () => {
      const arr = linksArrayPool.acquire();
      linksArrayPool.release(arr);
      linksArrayPool.reset();

      const stats = linksArrayPool.getStats()!;
      expect(stats.poolSize).toBe(0);
      expect(stats.acquired).toBe(0);

      // ensure pool works normally after reset
      linksArrayPool.release(linksArrayPool.acquire());
      expect(linksArrayPool.getStats()?.poolSize).toBe(1);
    });
  });

  describe('custom config instances', () => {
    it('respects custom capacity and limit instantiation options', () => {
      const pool = new ArrayPool<number>(3, 10, true);
      const arrays = Array.from({ length: 4 }, () => pool.acquire());
      arrays.forEach((arr) => pool.release(arr));

      expect(pool.getStats()?.poolSize).toBe(3);
      expect(pool.getStats()?.rejected.poolFull).toBe(1);

      pool.release(new Array(11).fill(0));
      expect(pool.getStats()?.rejected.tooLarge).toBe(1);
    });
  });
});
