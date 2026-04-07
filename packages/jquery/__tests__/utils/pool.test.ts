import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectObject } from '@/types';
import {
  ArrayPool,
  bindingRecordPool,
  cleanupsArrayPool,
  effectsArrayPool,
  ObjectPool,
} from '@/utils/pool';

// ============================================================================
// ArrayPool Tests
// ============================================================================

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

// ============================================================================
// ObjectPool Tests
// ============================================================================

interface TestObj {
  x: number;
  y: string | null;
  z: boolean;
}

const createTestObj = (): TestObj => ({ x: 0, y: null, z: false });
const resetTestObj = (obj: TestObj): void => {
  obj.x = 0;
  obj.y = null;
  obj.z = false;
};

describe('ObjectPool', () => {
  let pool: ObjectPool<TestObj>;
  const LIMIT = 4;

  beforeEach(() => {
    pool = new ObjectPool<TestObj>(createTestObj, resetTestObj, LIMIT);
  });

  describe('Basic Acquisition & Reuse', () => {
    it('should create objects via factory and reuse them in LIFO order', () => {
      // 1. Initial acquire from factory
      const firstAcquired = pool.acquire();
      expect(firstAcquired).toEqual({ x: 0, y: null, z: false });
      expect(pool.size).toBe(0);

      // 2. Reuse in LIFO
      const a = pool.acquire();
      const b = pool.acquire();
      a.x = 100;
      b.x = 200;

      pool.release(a);
      pool.release(b);

      const reusedB = pool.acquire(); // last in, first out
      const reusedA = pool.acquire();

      expect(reusedB).toBe(b);
      expect(reusedB.x).toBe(0); // reset on release
      expect(reusedA).toBe(a);
      expect(reusedA.x).toBe(0);

      // Exhausted pool
      expect(pool.acquire()).not.toBe(a);
    });
  });

  describe('Safety & Hygiene', () => {
    it('should always reset the object regardless of pooling outcome', () => {
      // 1. Fill pool with distinct objects
      const objects: TestObj[] = [];
      for (let i = 0; i < LIMIT; i++) objects.push(pool.acquire());
      for (const obj of objects) pool.release(obj);

      expect(pool.size).toBe(LIMIT);

      // 2. Reject by limit but still reset
      const overflow = pool.acquire();
      overflow.x = 99;
      pool.release(overflow);

      expect(overflow.x).toBe(0); // must be reset to broke references
      expect(pool.size).toBe(LIMIT); // was rejected (limit=4)
    });

    it('should handle invalid releases without corruption', () => {
      // Double release protection
      const obj = pool.acquire();
      pool.release(obj);
      pool.release(obj);
      expect(pool.size).toBe(1);

      // Frozen object handling
      const frozen = Object.freeze(createTestObj());
      expect(() => pool.release(frozen)).not.toThrow();
      expect(pool.size).toBe(1); // (prev stored 'obj' is still there)
    });
  });

  describe('Policies', () => {
    it('should maintain monomorphic shape for optimization', () => {
      // Different acquire paths (factory vs pool) should output same keys
      const fromFactory = pool.acquire();
      pool.release(fromFactory);
      const fromPool = pool.acquire();

      const keysF = Object.keys(fromFactory).sort();
      const keysP = Object.keys(fromPool).sort();

      expect(keysF).toEqual(keysP);
    });

    it('should respect custom capacity limits', () => {
      const tinyPool = new ObjectPool<TestObj>(createTestObj, resetTestObj, 1);
      tinyPool.release(tinyPool.acquire());
      tinyPool.release(tinyPool.acquire());
      expect(tinyPool.size).toBe(1);
    });
  });

  describe('Management', () => {
    it('should reflect current size and drain correctly', () => {
      expect(pool.size).toBe(0);

      const a = pool.acquire();
      const b = pool.acquire();
      pool.release(a);
      pool.release(b);
      expect(pool.size).toBe(2);

      pool.drain();
      expect(pool.size).toBe(0);
      expect(pool.acquire()).toEqual(createTestObj());
    });
  });
});

// ============================================================================
// BindingRecordPool Orchestration (Safety)
// ============================================================================

describe('bindingRecordPool Orchestration (Safety)', () => {
  it('should dispose all contained effects and execute all cleanups when the record is released', () => {
    const record = bindingRecordPool.acquire();

    // 1. Mock Effects
    const fx1 = { dispose: vi.fn() } as unknown as EffectObject;
    const fx2 = { dispose: vi.fn() } as unknown as EffectObject;
    record.effects = effectsArrayPool.acquire();
    record.effects.push(fx1, fx2);

    // 2. Mock Cleanups
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const componentCleanup = vi.fn();
    record.cleanups = cleanupsArrayPool.acquire();
    record.cleanups.push(cleanup1, cleanup2);
    record.componentCleanup = componentCleanup;

    // 3. Release back to pool
    bindingRecordPool.release(record);

    // 4. Verify Orchestration
    expect(fx1.dispose).toHaveBeenCalled();
    expect(fx2.dispose).toHaveBeenCalled();
    expect(cleanup1).toHaveBeenCalled();
    expect(cleanup2).toHaveBeenCalled();
    expect(componentCleanup).toHaveBeenCalled();

    // 5. Verify State Reset
    expect(record.effects).toBeUndefined();
    expect(record.cleanups).toBeUndefined();
    expect(record.componentCleanup).toBeUndefined();
  });
});
