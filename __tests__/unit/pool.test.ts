import { describe, it, expect, beforeEach } from 'vitest';
import { depArrayPool, EMPTY_DEPS } from '../../src/pool';
import { Dependency } from '../../src/types';

describe('ArrayPool', () => {
  beforeEach(() => {
    depArrayPool.reset();
  });

  it('should acquire an empty array when pool is empty', () => {
    const arr = depArrayPool.acquire();
    expect(arr).toEqual([]);
    expect(Array.isArray(arr)).toBe(true);
  });

  it('should reuse released arrays', () => {
    const arr1 = depArrayPool.acquire();
    depArrayPool.release(arr1);
    const arr2 = depArrayPool.acquire();
    expect(arr2).toBe(arr1);
  });

  it('should not release frozen arrays', () => {
    const arr = Object.freeze([]);
    // This should trigger the frozen check
    depArrayPool.release(arr as any);
    
    const stats = depArrayPool.getStats();
    if (stats) {
      expect(stats.rejected.frozen).toBe(1);
    }
  });

  it('should not release arrays that are the empty constant', () => {
    depArrayPool.release(EMPTY_DEPS as any, EMPTY_DEPS);
    const stats = depArrayPool.getStats();
    if (stats) {
      expect(stats.released).toBe(0);
    }
  });

  it('should not release arrays exceeding maxReusableCapacity', () => {
    const largeArr = new Array(300).fill(null);
    depArrayPool.release(largeArr as any);
    
    const stats = depArrayPool.getStats();
    if (stats) {
      expect(stats.rejected.tooLarge).toBe(1);
    }
  });

  it('should not exceed maxPoolSize', () => {
    const arrays = Array.from({ length: 60 }, () => depArrayPool.acquire());
    arrays.forEach(arr => depArrayPool.release(arr));
    
    const stats = depArrayPool.getStats();
    if (stats) {
      expect(stats.poolSize).toBe(50); // maxPoolSize is 50
      expect(stats.rejected.poolFull).toBe(10);
    }
  });

  it('should provide stats in DEV mode', () => {
    depArrayPool.acquire();
    const stats = depArrayPool.getStats();
    if (stats) {
      expect(stats.acquired).toBe(1);
      expect(stats.leaked).toBe(1);
    }
  });

  it('should reset stats and pool', () => {
    depArrayPool.acquire();
    depArrayPool.reset();
    const stats = depArrayPool.getStats();
    if (stats) {
      expect(stats.acquired).toBe(0);
      expect(stats.poolSize).toBe(0);
    }
  });
});
