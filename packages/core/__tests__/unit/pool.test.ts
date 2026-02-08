import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_LINKS, linksArrayPool } from '@/internal/pool';
import type { DependencyLink } from '@/core/dep-tracking';

describe('ArrayPool', () => {
  beforeEach(() => {
    linksArrayPool.reset();
  });

  it('should acquire an empty array when pool is empty', () => {
    const arr = linksArrayPool.acquire();
    expect(arr).toEqual([]);
    expect(Array.isArray(arr)).toBe(true);
  });

  it('should reuse released arrays', () => {
    const arr1 = linksArrayPool.acquire();
    linksArrayPool.release(arr1);
    const arr2 = linksArrayPool.acquire();
    expect(arr2).toBe(arr1);
  });

  it('should not release frozen arrays', () => {
    const arr = Object.freeze([]);
    linksArrayPool.release(arr as unknown as DependencyLink[]);

    const stats = linksArrayPool.getStats();
    if (stats) {
      expect(stats.rejected.frozen).toBe(1);
    }
  });

  it('should not release arrays that are the empty constant', () => {
    linksArrayPool.release(EMPTY_LINKS as unknown as DependencyLink[], EMPTY_LINKS);
    const stats = linksArrayPool.getStats();
    if (stats) {
      expect(stats.released).toBe(0);
    }
  });

  it('should not release arrays exceeding maxReusableCapacity', () => {
    const largeArr = new Array(300).fill(null);
    linksArrayPool.release(largeArr as unknown as DependencyLink[]);

    const stats = linksArrayPool.getStats();
    if (stats) {
      expect(stats.rejected.tooLarge).toBe(1);
    }
  });

  it('should not exceed maxPoolSize', () => {
    const arrays = Array.from({ length: 60 }, () => linksArrayPool.acquire());
    arrays.forEach((arr) => linksArrayPool.release(arr));

    const stats = linksArrayPool.getStats();
    if (stats) {
      expect(stats.poolSize).toBe(50); // maxPoolSize is 50
      expect(stats.rejected.poolFull).toBe(10);
    }
  });

  it('should provide stats in DEV mode', () => {
    linksArrayPool.acquire();
    const stats = linksArrayPool.getStats();
    if (stats) {
      expect(stats.acquired).toBe(1);
      expect(stats.leaked).toBe(1);
    }
  });

  it('should reset stats and pool', () => {
    linksArrayPool.acquire();
    linksArrayPool.reset();
    const stats = linksArrayPool.getStats();
    if (stats) {
      expect(stats.acquired).toBe(0);
      expect(stats.poolSize).toBe(0);
    }
  });
});
