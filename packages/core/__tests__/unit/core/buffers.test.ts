/**
 * @fileoverview ReactiveTracker Dependency Buffer Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { trackingContext } from '@/core/base';
import { ReactiveTracker } from '@/core/tracker';
import { atom, type Dependency } from '@/index';
import type { DependencyLink } from '@/types';

class TestTracker extends ReactiveTracker {
  addDependency(dependency: Dependency): void {
    this.trackDependency(dependency, () => {});
  }
}

const createLink = (
  node: Dependency,
  version: number,
  unsubscribeCallback: () => void = vi.fn()
): DependencyLink => ({ node, version, unsubscribeCallback });

describe('ReactiveTracker Dependency Buffer', () => {
  const createMockDep = (id: number): Dependency => {
    const mock: Partial<Dependency> = {
      id,
      version: 1,
      flags: 0,
      _lastSeenEpoch: -1,
      subscribe: vi.fn(() => vi.fn()),
    };
    return mock as Dependency;
  };

  describe('trackDependency() link reuse & swapping', () => {
    it('should swap and relocate existing dependencies without re-subscribing', () => {
      const tracker = new TestTracker();
      const mockDependencies = [0, 1, 2].map((id) => createMockDep(id));
      const [dep0, dep1, dep2] = mockDependencies;
      if (!dep0 || !dep1 || !dep2) throw new Error('Setup failed');

      tracker.startTracking();
      for (const dep of mockDependencies) {
        tracker.addDependency(dep);
      }
      tracker.truncateDepsFrom(tracker._trackCount);

      expect(dep0.subscribe).toHaveBeenCalledTimes(1);
      expect(dep1.subscribe).toHaveBeenCalledTimes(1);
      expect(dep2.subscribe).toHaveBeenCalledTimes(1);

      // Re-track in reverse order: dep2 should be swapped to index 0 without re-subscribing
      tracker.startTracking();
      tracker.addDependency(dep2);
      tracker.addDependency(dep1);
      tracker.addDependency(dep0);
      tracker.truncateDepsFrom(tracker._trackCount);

      expect(tracker._depSlots.at(0)?.node).toBe(dep2);
      expect(tracker._depSlots.at(1)?.node).toBe(dep1);
      expect(tracker._depSlots.at(2)?.node).toBe(dep0);
      expect(dep2.subscribe).toHaveBeenCalledTimes(1);
    });

    it('preserves the subscription displaced by a newly tracked dependency', () => {
      const tracker = new TestTracker();
      const first = atom(1);
      const second = atom(2);
      const subscribe = vi.spyOn(first, 'subscribe');

      tracker.startTracking();
      tracker.addDependency(first);
      tracker.truncateDepsFrom(tracker._trackCount);

      tracker.startTracking();
      tracker.addDependency(second);
      tracker.addDependency(first);
      tracker.truncateDepsFrom(tracker._trackCount);

      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(first.subscriberCount()).toBe(1);
      expect(second.subscriberCount()).toBe(1);

      tracker.truncateDepsFrom(0);
      expect(first.subscriberCount()).toBe(0);
      expect(second.subscriberCount()).toBe(0);
    });

    it('handles duplicate dependencies within a single tracking session', () => {
      const tracker = new TestTracker();
      const dep0 = createMockDep(0);

      tracker.startTracking();
      tracker.addDependency(dep0);
      tracker.addDependency(dep0);
      tracker.truncateDepsFrom(tracker._trackCount);

      expect(tracker._depSlots.size).toBe(1);
      expect(dep0.subscribe).toHaveBeenCalledTimes(1);
    });

    it('does not inflate size when re-tracking after full truncation', () => {
      const tracker = new TestTracker();
      const dep0 = createMockDep(0);
      const dep1 = createMockDep(1);

      tracker.startTracking();
      tracker.addDependency(dep0);
      tracker.truncateDepsFrom(tracker._trackCount);
      expect(tracker._depSlots.size).toBe(1);

      tracker.truncateDepsFrom(0);
      expect(tracker._depSlots.size).toBe(0);

      tracker.startTracking();
      tracker.addDependency(dep1);
      tracker.truncateDepsFrom(tracker._trackCount);
      expect(tracker._depSlots.size).toBe(1);
    });
  });

  describe('truncateDepsFrom()', () => {
    it('triggers unsubscriptions when truncating or disposing', () => {
      const tracker = new TestTracker();
      const unsubscribeCallbacks = [vi.fn(), vi.fn(), vi.fn()];
      for (let i = 0; i < unsubscribeCallbacks.length; i++) {
        const u = unsubscribeCallbacks[i];
        if (u) {
          tracker._depSlots.push(createLink(createMockDep(i), 1, u));
        }
      }

      tracker.truncateDepsFrom(1); // Removes index 1, 2
      expect(unsubscribeCallbacks[0]).not.toHaveBeenCalled();
      expect(unsubscribeCallbacks[1]).toHaveBeenCalled();
      expect(unsubscribeCallbacks[2]).toHaveBeenCalled();

      tracker.truncateDepsFrom(0);
      expect(unsubscribeCallbacks[0]).toHaveBeenCalled();
      expect(tracker._depSlots.size).toBe(0);
    });

    it('handles unsubscribe callback throwing errors during truncation', () => {
      const tracker = new TestTracker();
      const errorThrowingUnsubscribe = () => {
        throw new Error('Unsubscribe failed error');
      };
      tracker._depSlots.push(createLink(createMockDep(1), 1, errorThrowingUnsubscribe));

      expect(() => {
        tracker.truncateDepsFrom(0);
      }).not.toThrow();
    });
  });

  describe('isDepsDirty()', () => {
    it('should not swallow system-level exceptions (e.g. RangeError)', () => {
      const tracker = new TestTracker();

      const systemErrorDep: Partial<Dependency> = {
        id: 998,
        version: 1,
        isComputed: true,
        get value() {
          throw new RangeError('Maximum call stack size exceeded');
        },
        subscribe: vi.fn(() => vi.fn()),
      };

      tracker._depSlots.push(createLink(systemErrorDep as Dependency, 1));

      expect(() => tracker.isDepsDirty(true)).toThrow(RangeError);
    });

    it('should mark buffer as dirty on non-system errors thrown during computed dependency evaluation', () => {
      const tracker = new TestTracker();

      const customErrorDep: Partial<Dependency> = {
        id: 999,
        version: 1,
        isComputed: true,
        get value() {
          throw new Error('Custom computation error');
        },
        subscribe: vi.fn(() => vi.fn()),
      };

      tracker._depSlots.push(createLink(customErrorDep as Dependency, 1));

      expect(tracker.isDepsDirty(true)).toBe(true);
    });

    it('runs untracked if trackingContext.current is active during dirty check', () => {
      const tracker = new TestTracker();
      const depValSpy = vi.fn(() => 42);
      const computedDep: Partial<Dependency> = {
        id: 100,
        version: 1,
        isComputed: true,
        get value() {
          return depValSpy();
        },
        subscribe: vi.fn(() => vi.fn()),
      };
      tracker._depSlots.push(createLink(computedDep as Dependency, 1));

      const mockContext = {
        addDependency: vi.fn(),
      };

      const originalTrackingContext = trackingContext.current;
      try {
        trackingContext.current = mockContext;
        const isDirtyResult = tracker.isDepsDirty(true);
        expect(isDirtyResult).toBe(false);
        expect(depValSpy).toHaveBeenCalled();
        expect(mockContext.addDependency).not.toHaveBeenCalled();
      } finally {
        trackingContext.current = originalTrackingContext;
      }
    });
  });
});
