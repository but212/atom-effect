import { describe, expect, it, vi } from 'vitest';
import { syncDependencies } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';
import { ArrayPool } from '@/utils/array-pool';
import { debug } from '@/utils/debug';
import { isComputed } from '@/utils/type-guards';

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

  describe('DepTracking - trackDependency', () => {
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
