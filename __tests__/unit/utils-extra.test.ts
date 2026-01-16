import { describe, expect, it, vi } from 'vitest';
import { syncDependencies } from '../../src/core/utils/dep-tracking';
import { ArrayPool } from '../../src/utils/array-pool';
import { debug } from '../../src/utils/debug';
import { ObjectPool, type Poolable } from '../../src/utils/object-pool';
import { SubscriberManager } from '../../src/utils/subscriber-manager';
import { isComputed, isTrackableFunction } from '../../src/utils/type-guards';

describe('Utils & Handlers - Extra Coverage', () => {
  describe('DepTracking - syncDependencies', () => {
    it('skips null/undefined dependencies in nextDeps', () => {
      // biome-ignore lint/suspicious/noExplicitAny: explicit invalid types test
      const nextDeps = [null, undefined] as any[];
      // Should not crash and continue
      // biome-ignore lint/suspicious/noExplicitAny: explicit invalid types test
      const unsubs = syncDependencies(nextDeps, [], [], {} as any);
      // length is preserved as nextDeps.length
      expect(unsubs.length).toBe(2);
      // But slots are empty
      expect(unsubs[0]).toBeUndefined();
    });
  });

  describe('ArrayPool', () => {
    it('rejects frozen arrays', () => {
      const pool = new ArrayPool<unknown>();
      const frozen = Object.freeze([]);

      // biome-ignore lint/suspicious/noExplicitAny: Access private internals
      const initialSize = (pool as any).pool.length;
      // biome-ignore lint/suspicious/noExplicitAny: Testing specific invalid input
      pool.release(frozen as any);

      // biome-ignore lint/suspicious/noExplicitAny: Access private
      expect((pool as any).pool.length).toBe(initialSize);
      // Stats check if dev mode
      const stats = pool.getStats();
      if (stats) {
        expect(stats.rejected.frozen).toBeGreaterThan(0);
      }
    });

    it('rejects arrays larger than maxReusableCapacity', () => {
      const pool = new ArrayPool<unknown>();
      const hugeArray = new Array(300); // Default max is 256

      // biome-ignore lint/suspicious/noExplicitAny: Access private internals
      const initialSize = (pool as any).pool.length;
      pool.release(hugeArray);

      // biome-ignore lint/suspicious/noExplicitAny: Access private
      expect((pool as any).pool.length).toBe(initialSize);
      const stats = pool.getStats();
      if (stats) {
        expect(stats.rejected.tooLarge).toBeGreaterThan(0);
      }
    });

    it('rejects when pool is full', () => {
      const pool = new ArrayPool<unknown>();
      // Fill pool
      for (let i = 0; i < 60; i++) {
        // Max pool size is 50
        pool.release([]);
      }

      // Should cap at 50
      // biome-ignore lint/suspicious/noExplicitAny: Access private
      expect((pool as any).pool.length).toBe(50);
      const stats = pool.getStats();
      if (stats) {
        expect(stats.rejected.poolFull).toBeGreaterThan(0);
      }
    });

    it('handles null stats in production simulation', () => {
      const pool = new ArrayPool<unknown>();
      // biome-ignore lint/suspicious/noExplicitAny: Simulate Prod
      (pool as any).stats = null; // Simulate Prod

      expect(pool.acquire()).toEqual([]);
      pool.release([]);
      expect(pool.getStats()).toBeNull();
      pool.reset(); // Should not crash
    });
  });

  describe('ObjectPool', () => {
    class TestObj implements Poolable {
      reset() {}
    }

    it('warmup adds to existing pool size', () => {
      const pool = new ObjectPool(() => new TestObj(), 10);
      pool.warmup(2);
      // biome-ignore lint/suspicious/noExplicitAny: Access private
      expect((pool as any).poolSize).toBe(2);

      pool.warmup(5); // Should add 3 more to reach 5, but logic is loop from size to target
      // code: for (let i = this.poolSize; i < targetSize; i++)
      // targetSize = Math.min(count, maxPoolSize)
      // so warmup(5) sets target to 5. i goes 2->5.
      // biome-ignore lint/suspicious/noExplicitAny: Access private
      expect((pool as any).poolSize).toBe(5);
    });
  });

  describe('Type Guards', () => {
    it('isTrackableFunction identifies functions with addDependency', () => {
      const fn = () => {};
      // biome-ignore lint/suspicious/noExplicitAny: Monkey patch
      (fn as any).addDependency = () => {};
      expect(isTrackableFunction(fn)).toBe(true);
      expect(isTrackableFunction(() => {})).toBe(false);
    });

    it('isComputed checks debug type if enabled', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;

      const mockComputed = {
        value: 1,
        subscribe: () => {},
        invalidate: () => {},
      };
      // Stub getDebugType to return 'computed'
      const debugSpy = vi.spyOn(debug, 'getDebugType').mockReturnValue('computed');

      expect(isComputed(mockComputed)).toBe(true);

      debugSpy.mockRestore();
      debug.enabled = wasEnabled;
    });
  });

  describe('SubscriberManager', () => {
    it('handles removals of non-existent subscribers', () => {
      const sm = new SubscriberManager<number>();
      // Remove from empty
      expect(sm.remove(1)).toBe(false);

      sm.add(1);
      // Remove non-existent
      expect(sm.remove(2)).toBe(false);
      // Remove existing
      expect(sm.remove(1)).toBe(true);
    });

    it('forEachSafe handles errors without onError', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const sm = new SubscriberManager();
      sm.add(() => {
        throw new Error('Fail');
      });

      // biome-ignore lint/suspicious/noExplicitAny: Testing generic callback
      expect(() => sm.forEachSafe((fn: any) => fn())).not.toThrow();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('add returns idempotent unsubscribe', () => {
      const sm = new SubscriberManager();
      const unsub = sm.add(1);

      expect(sm.size).toBe(1);
      unsub();
      expect(sm.size).toBe(0);
      unsub(); // Second call ignores
      expect(sm.size).toBe(0);

      // Re-add same
      sm.add(1);
      const unsub2 = sm.add(1); // Already exists
      // This unsub2 is a no-op? No, the implementation returns empty func if exists
      expect(sm.size).toBe(1);
      unsub2(); // Should do nothing
      expect(sm.size).toBe(1);
    });
  });

  describe('Debug Utils', () => {
    it('checkCircular implementation details', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;

      // biome-ignore lint/suspicious/noExplicitAny: Mocking internal structure
      const dep1: any = { id: 1, _visitedEpoch: -1 };
      // biome-ignore lint/suspicious/noExplicitAny: Mocking internal structure
      const dep2: any = { id: 2, _visitedEpoch: -1, dependencies: [dep1] };

      // Case 1: Indirect circular
      dep1.dependencies = [dep2];

      expect(() => debug.checkCircular(dep1, dep2)).toThrow(/Indirect circular dependency/);

      // Case 2: Early return if visited
      // Manually mess up visited epoch to simulate re-visit in same check
      // but checkCircular handles epoch increment.

      // Case 3: Dep without dependencies array
      // biome-ignore lint/suspicious/noExplicitAny: Mock dependency
      const emptyDep: any = { id: 3 };
      expect(() => debug.checkCircular(emptyDep, {})).not.toThrow();

      debug.enabled = wasEnabled;
    });
  });
});
