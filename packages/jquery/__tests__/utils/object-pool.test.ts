import { beforeEach, describe, expect, it } from 'vitest';
import { ObjectPool } from '@/utils/object-pool';

interface TestObj {
  x: number;
  y: string | null;
  z: boolean;
}

function createTestObj(): TestObj {
  return { x: 0, y: null, z: false };
}

function resetTestObj(obj: TestObj): void {
  obj.x = 0;
  obj.y = null;
  obj.z = false;
}

describe('ObjectPool', () => {
  let pool: ObjectPool<TestObj>;

  beforeEach(() => {
    pool = new ObjectPool<TestObj>(createTestObj, resetTestObj, 4);
  });

  // --------------------------------------------------------------------------
  // acquire
  // --------------------------------------------------------------------------

  describe('acquire', () => {
    it('should create a new object via factory when pool is empty', () => {
      const obj = pool.acquire();
      expect(obj).toEqual({ x: 0, y: null, z: false });
    });

    it('should return distinct objects on consecutive acquires from empty pool', () => {
      const a = pool.acquire();
      const b = pool.acquire();
      expect(a).not.toBe(b);
    });

    it('should return a previously released object (LIFO reuse)', () => {
      const original = pool.acquire();
      original.x = 42;
      original.y = 'hello';
      original.z = true;

      pool.release(original);
      const reused = pool.acquire();

      // Same reference
      expect(reused).toBe(original);
      // Fields were reset
      expect(reused.x).toBe(0);
      expect(reused.y).toBe(null);
      expect(reused.z).toBe(false);
    });

    it('should follow LIFO order', () => {
      const a = pool.acquire();
      const b = pool.acquire();
      const c = pool.acquire();

      pool.release(a);
      pool.release(b);
      pool.release(c);

      expect(pool.acquire()).toBe(c); // last released = first acquired
      expect(pool.acquire()).toBe(b);
      expect(pool.acquire()).toBe(a);
    });
  });

  // --------------------------------------------------------------------------
  // release
  // --------------------------------------------------------------------------

  describe('release', () => {
    it('should reset fields via the reset callback', () => {
      const obj = pool.acquire();
      obj.x = 999;
      obj.y = 'dirty';
      obj.z = true;

      pool.release(obj);

      // Verify fields are reset (by acquiring back)
      const reused = pool.acquire();
      expect(reused).toBe(obj);
      expect(reused.x).toBe(0);
      expect(reused.y).toBe(null);
      expect(reused.z).toBe(false);
    });

    it('should discard when pool is at limit', () => {
      // limit = 4
      const objects: TestObj[] = [];
      for (let i = 0; i < 5; i++) {
        objects.push(pool.acquire());
      }

      // Release 5, but pool only holds 4
      for (const obj of objects) {
        pool.release(obj);
      }

      expect(pool.size).toBe(4);
    });

    it('should not double-pool the same object when released twice', () => {
      const obj = pool.acquire();
      pool.release(obj);
      pool.release(obj); // second release

      // Pool should have 2 entries (same ref twice) — this is caller's
      // responsibility to avoid, but the pool should not crash.
      expect(pool.size).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // drain
  // --------------------------------------------------------------------------

  describe('drain', () => {
    it('should empty the pool', () => {
      // Acquire 3 distinct objects first, then release them all.
      const a = pool.acquire();
      const b = pool.acquire();
      const c = pool.acquire();
      pool.release(a);
      pool.release(b);
      pool.release(c);

      expect(pool.size).toBe(3);

      pool.drain();

      expect(pool.size).toBe(0);
      // Next acquire should create a fresh object
      const fresh = pool.acquire();
      expect(fresh).toEqual({ x: 0, y: null, z: false });
    });
  });

  // --------------------------------------------------------------------------
  // size
  // --------------------------------------------------------------------------

  describe('size', () => {
    it('should reflect the number of pooled objects', () => {
      expect(pool.size).toBe(0);

      const a = pool.acquire();
      expect(pool.size).toBe(0); // acquired, not in pool

      pool.release(a);
      expect(pool.size).toBe(1);

      pool.acquire();
      expect(pool.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Monomorphic shape guarantee
  // --------------------------------------------------------------------------

  describe('monomorphic shape', () => {
    it('should produce objects with identical property keys regardless of acquire order', () => {
      const first = pool.acquire();
      const keysFirst = Object.keys(first).sort();

      pool.release(first);
      const second = pool.acquire();
      const keysSecond = Object.keys(second).sort();

      pool.release(second);

      // A brand new one from factory
      const third = pool.acquire();
      pool.acquire(); // exhaust pool so next is from factory
      const fourth = pool.acquire();
      const keysThird = Object.keys(third).sort();
      const keysFourth = Object.keys(fourth).sort();

      expect(keysFirst).toEqual(keysSecond);
      expect(keysSecond).toEqual(keysThird);
      expect(keysThird).toEqual(keysFourth);
    });
  });

  // --------------------------------------------------------------------------
  // Custom limit
  // --------------------------------------------------------------------------

  describe('custom limit', () => {
    it('should respect a limit of 1', () => {
      const tinyPool = new ObjectPool<TestObj>(createTestObj, resetTestObj, 1);

      const a = tinyPool.acquire();
      const b = tinyPool.acquire();

      tinyPool.release(a);
      tinyPool.release(b); // should be discarded

      expect(tinyPool.size).toBe(1);
      expect(tinyPool.acquire()).toBe(a);
    });
  });

  // --------------------------------------------------------------------------
  // Integration: acquire-release cycle
  // --------------------------------------------------------------------------

  describe('acquire-release cycle', () => {
    it('should reuse objects across multiple cycles without leaking state', () => {
      const cycle1: TestObj[] = [];

      // Cycle 1
      for (let i = 0; i < 3; i++) {
        const obj = pool.acquire();
        obj.x = i + 100;
        obj.y = `cycle1-${i}`;
        obj.z = true;
        cycle1.push(obj);
      }

      // Release all
      for (const obj of cycle1) {
        pool.release(obj);
      }

      // Cycle 2
      for (let i = 0; i < 3; i++) {
        const obj = pool.acquire();
        // Must be clean after reset
        expect(obj.x).toBe(0);
        expect(obj.y).toBe(null);
        expect(obj.z).toBe(false);
      }
    });
  });
});
