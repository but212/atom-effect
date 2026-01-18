import { describe, expect, it, vi } from 'vitest';
import { atom } from '../../src/core/atom';
import { syncDependencies } from '../../src/core/utils/dep-tracking';
import type { Dependency, Subscriber } from '../../src/types';
import { ArrayPool } from '../../src/utils/array-pool';
import { debug } from '../../src/utils/debug';
import { ObjectPool, type Poolable } from '../../src/utils/object-pool';
import { SubscriberManager } from '../../src/utils/subscriber-manager';
import { isComputed, isTrackableFunction } from '../../src/utils/type-guards';

describe('Utils & Handlers - Extra Coverage', () => {
  describe('DepTracking - syncDependencies', () => {
    it('skips null/undefined dependencies in nextDeps', () => {
      const nextDeps = [null, undefined] as unknown as Dependency[];
      // Should not crash and continue
      const unsubs = syncDependencies(nextDeps, [], [], {} as unknown as Subscriber);
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

      const initialSize = (pool as unknown as { pool: unknown[] }).pool.length;
      pool.release(frozen as unknown as unknown[]);

      expect((pool as unknown as { pool: unknown[] }).pool.length).toBe(initialSize);
      // Stats check if dev mode
      const stats = pool.getStats();
      if (stats) {
        expect(stats.rejected.frozen).toBeGreaterThan(0);
      }
    });

    it('rejects arrays larger than maxReusableCapacity', () => {
      const pool = new ArrayPool<unknown>();
      const hugeArray = new Array(300); // Default max is 256

      const initialSize = (pool as unknown as { pool: unknown[] }).pool.length;
      pool.release(hugeArray);

      expect((pool as unknown as { pool: unknown[] }).pool.length).toBe(initialSize);
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
      expect((pool as unknown as { pool: unknown[] }).pool.length).toBe(50);
      const stats = pool.getStats();
      if (stats) {
        expect(stats.rejected.poolFull).toBeGreaterThan(0);
      }
    });

    it('handles null stats in production simulation', () => {
      const pool = new ArrayPool<unknown>();
      (pool as unknown as { stats: null }).stats = null; // Simulate Prod

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
      expect((pool as unknown as { poolSize: number }).poolSize).toBe(2);

      pool.warmup(5); // Should add 3 more to reach 5, but logic is loop from size to target
      // code: for (let i = this.poolSize; i < targetSize; i++)
      // targetSize = Math.min(count, maxPoolSize)
      // so warmup(5) sets target to 5. i goes 2->5.
      expect((pool as unknown as { poolSize: number }).poolSize).toBe(5);
    });
  });

  describe('DepTracking - trackDependency', () => {
    it('tracks object with execute method', () => {
      const dep = atom(0);
      const sub = { execute: vi.fn() };
      const objSubs = new SubscriberManager<Subscriber>();
      const funcSubs = new SubscriberManager<(newValue?: unknown, oldValue?: unknown) => void>();

      import('../../src/core/utils/dep-tracking').then(({ trackDependency }) => {
        trackDependency(
          dep as unknown as Dependency,
          sub as unknown as Subscriber,
          funcSubs,
          objSubs
        );
        expect(objSubs.has(sub as unknown as Subscriber)).toBe(true);
      });
    });

    it('syncDependencies reuses existing subscriptions', () => {
      const dep = {
        subscribe: vi.fn(() => () => {}),
        _tempUnsub: undefined,
      } as unknown as Dependency;
      const unsub = () => {};
      const prevUnsubs = [unsub];

      const nextUnsubs = syncDependencies([dep], [dep], prevUnsubs, {} as unknown as Subscriber);

      expect(nextUnsubs[0]).toBe(unsub);
      expect(dep.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('Type Guards', () => {
    it('isTrackableFunction identifies functions with addDependency', () => {
      const fn = () => {};
      (fn as unknown as { addDependency: () => void }).addDependency = () => {};
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

      expect(() => sm.forEachSafe((fn) => (fn as () => void)())).not.toThrow();
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

      interface MockDep {
        id: number;
        _visitedEpoch: number;
        dependencies?: MockDep[];
      }
      const dep1: MockDep = { id: 1, _visitedEpoch: -1 };
      const dep2: MockDep = { id: 2, _visitedEpoch: -1, dependencies: [dep1] };

      // Case 1: Indirect circular
      dep1.dependencies = [dep2];

      expect(() => debug.checkCircular(dep1 as unknown as Dependency, dep2)).toThrow(
        /Indirect circular dependency/
      );

      // Case 2: Diamond dependency (hits visited branch)
      // dep1 -> dep2, dep1 -> dep3, dep2 -> dep4, dep3 -> dep4
      const d4: MockDep = { id: 4, _visitedEpoch: -1 };
      const d2: MockDep = { id: 2, _visitedEpoch: -1, dependencies: [d4] };
      const d3: MockDep = { id: 3, _visitedEpoch: -1, dependencies: [d4] };
      const d1: MockDep = { id: 1, _visitedEpoch: -1, dependencies: [d2, d3] };

      expect(() => debug.checkCircular(d1 as unknown as Dependency, {})).not.toThrow();
      expect(d4._visitedEpoch).toBeGreaterThan(0); // This confirms line 39 in debug.ts was hit

      // Case 3: Dep without dependencies array
      const emptyDep: MockDep = { id: 3, _visitedEpoch: -1 };
      expect(() => debug.checkCircular(emptyDep as unknown as Dependency, {})).not.toThrow();

      debug.enabled = wasEnabled;
    });
  });
});
