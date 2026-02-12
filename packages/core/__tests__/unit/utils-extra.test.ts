import { describe, expect, it, vi } from 'vitest';
import { DependencyLink, syncDependencies } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';
import { ArrayPool } from '@/utils/array-pool';
import { debug } from '@/utils/debug';
import { isComputed } from '@/utils/type-guards';

describe('Utils & Handlers - Extra Coverage', () => {
  describe('DepTracking - syncDependencies', () => {
    it('skips null/undefined dependencies in nextDeps', () => {
      const nextLinks = [null, undefined] as unknown as DependencyLink[];
      // Should not crash and continue
      syncDependencies(nextLinks, [], {} as unknown as Subscriber);

      expect(nextLinks.length).toBe(2);
      expect(nextLinks[0]).toBeNull();
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
        version: 1,
        subscribe: vi.fn(() => () => {}),
      } as unknown as Dependency;
      const unsub = vi.fn();

      const prevLink = new DependencyLink(dep, 1, unsub);
      const nextLink = new DependencyLink(dep, 1);

      syncDependencies([nextLink], [prevLink], {} as unknown as Subscriber);

      expect(nextLink.unsub).toBe(unsub);
      expect(dep.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('Type Guards', () => {
    it('isComputed rejects duck-typed objects without brand symbol', () => {
      const mockComputed = {
        value: 1,
        subscribe: () => {},
        invalidate: () => {},
      };

      // Duck-typed objects should NOT pass brand-based type guards
      expect(isComputed(mockComputed)).toBe(false);
    });
  });

  describe('Debug Utils', () => {
    it('checkCircular implementation details', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;

      interface MockDep {
        id: number;
        dependencies?: MockDep[];
      }
      const dep1: MockDep = { id: 1 };
      const dep2: MockDep = { id: 2, dependencies: [dep1] };

      // Case 1: Indirect circular
      dep1.dependencies = [dep2];

      expect(() => debug.checkCircular(dep1 as unknown as Dependency, dep2)).toThrow(
        /Circular dependency detected/
      );

      // Case 2: Diamond dependency (hits visited branch)
      // dep1 -> dep2, dep1 -> dep3, dep2 -> dep4, dep3 -> dep4
      const d4: MockDep = { id: 4 };
      const d2: MockDep = { id: 2, dependencies: [d4] };
      const d3: MockDep = { id: 3, dependencies: [d4] };
      const d1: MockDep = { id: 1, dependencies: [d2, d3] };

      expect(() => debug.checkCircular(d1 as unknown as Dependency, {})).not.toThrow();

      // Case 3: Dep without dependencies array
      const emptyDep: MockDep = { id: 3 };
      expect(() => debug.checkCircular(emptyDep as unknown as Dependency, {})).not.toThrow();

      debug.enabled = wasEnabled;
    });
  });
});
