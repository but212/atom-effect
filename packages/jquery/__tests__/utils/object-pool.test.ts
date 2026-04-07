import { beforeEach, describe, expect, it } from 'vitest';
import { ObjectPool } from '@/utils/pool';

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
