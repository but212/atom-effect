/**
 * @fileoverview DepBuffer Refactored Tests
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { describe, expect, it, vi } from 'vitest';
import { COMPUTED_STATE_FLAGS } from '@/constants';
import { createDependencyLink, trackingContext } from '@/core/base';
import {
  BUFFER_FLAGS,
  claimExisting,
  depBufferPush,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
  isBufferDirty,
} from '@/core/buffers';
import type { Dependency } from '@/index';
import type { DependencyLink, ReactiveDependencyTracker } from '@/types';

function createDepBuffer(): ReactiveDependencyTracker {
  return {
    _depSlots: new SlotBuffer<DependencyLink>(),
    _depFlags: BUFFER_FLAGS.NONE,
    flags: 0,
    version: 0,
    _lastSeenEpoch: 0,
    _trackCount: 0,
    _trackEpoch: 0,
    _error: null,
    isRejected: false,
    id: 1,
    _subscriberSlots: null,
  };
}

const createLink = (
  node: Dependency,
  version: number,
  unsubscribeCallback?: () => void
): DependencyLink => createDependencyLink(node, version, unsubscribeCallback);

describe('DepBuffer', () => {
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

  describe('claimExisting()', () => {
    it('should swap and relocate dependencies correctly', () => {
      const depBuffer = createDepBuffer();
      const mockDependencies = [0, 1, 2].map((id) => createMockDep(id));
      const [mockDependency0, mockDependency1, mockDependency2] = mockDependencies;
      if (!mockDependency0 || !mockDependency1 || !mockDependency2) throw new Error('Setup failed');
      const links = mockDependencies.map((d) => createLink(d, 1, vi.fn()));
      for (const l of links) {
        depBufferPush(depBuffer, l);
      }

      // Case 1: Search ahead and swap (index 2 -> index 0)
      expect(claimExisting(depBuffer, mockDependency2, 0)).toBe(true);
      expect(depBuffer._depSlots.at(0)).toBe(links[2]);
      expect(depBuffer._depSlots.at(2)).toBe(links[0]);

      // Case 2: Out of range search
      expect(claimExisting(depBuffer, createMockDep(99), 0)).toBe(false);
    });

    it('handles duplicate dependencies by hitting the correct instances', () => {
      const depBuffer = createDepBuffer();
      const mockDependency0 = createMockDep(0);
      const dependencyLink0A = createLink(mockDependency0, 1, vi.fn());
      const dependencyLink0B = createLink(mockDependency0, 1, vi.fn());

      depBufferPush(depBuffer, dependencyLink0A);
      depBufferPush(depBuffer, dependencyLink0B);

      // 1. Should hit the first instance at trackIndex
      expect(claimExisting(depBuffer, mockDependency0, 0)).toBe(true);
      expect(depBuffer._depSlots.at(0)).toBe(dependencyLink0A);

      // 2. Should find the next instance ahead
      expect(claimExisting(depBuffer, mockDependency0, 1)).toBe(true);
      expect(depBuffer._depSlots.at(1)).toBe(dependencyLink0B);
    });
  });

  describe('insertNew()', () => {
    it('should correctly manage logical size irrespective of occupancy', () => {
      const depBuffer = createDepBuffer();
      const dependencyLink0 = createLink(createMockDep(0), 1, vi.fn());

      // 1. Write to empty slot (logical size 0 -> 1)
      insertNew(depBuffer, 2, dependencyLink0);
      expect(depBuffer._depSlots.size).toBe(1);

      // 2. Write to occupied slot (relocate dependencyLink0, write dependencyLink1 -> logical size 1 -> 2)
      const dependencyLink1 = createLink(createMockDep(1), 1, vi.fn());
      insertNew(depBuffer, 2, dependencyLink1);
      expect(depBuffer._depSlots.size).toBe(2);
      expect(depBuffer._depSlots.at(2)).toBe(dependencyLink1);
      expect(depBuffer._depSlots.has(dependencyLink0)).toBe(true); // Occupant must be relocated, not deleted
    });

    it('does not inflate size when doing repeated insertion into the same empty slot', () => {
      const depBuffer = createDepBuffer();
      const mockDependency0 = createMockDep(0);
      const mockDependency1 = createMockDep(1);

      insertNew(depBuffer, 0, createLink(mockDependency0, 1, vi.fn()));
      expect(depBuffer._depSlots.size).toBe(1);

      depBufferTruncateFrom(depBuffer, 0);
      expect(depBuffer._depSlots.size).toBe(0);

      insertNew(depBuffer, 0, createLink(mockDependency1, 1, vi.fn()));
      expect(depBuffer._depSlots.size).toBe(1);
    });
  });

  describe('depBufferTruncateFrom() & disposeAll()', () => {
    it('triggers unsubscriptions when truncating or disposing', () => {
      const depBuffer = createDepBuffer();
      const unsubscribeCallbacks = [vi.fn(), vi.fn(), vi.fn()];
      for (let i = 0; i < unsubscribeCallbacks.length; i++) {
        const u = unsubscribeCallbacks[i];
        if (u) {
          depBufferPush(depBuffer, createLink(createMockDep(i), 1, u));
        }
      }

      depBufferTruncateFrom(depBuffer, 1); // Removes index 1, 2
      expect(unsubscribeCallbacks[0]).not.toHaveBeenCalled();
      expect(unsubscribeCallbacks[1]).toHaveBeenCalled();
      expect(unsubscribeCallbacks[2]).toHaveBeenCalled();

      disposeAll(depBuffer);
      expect(unsubscribeCallbacks[0]).toHaveBeenCalled();
      expect(depBuffer._depSlots.size).toBe(0);
    });
  });

  describe('isBufferDirty()', () => {
    it('should not swallow system-level exceptions (e.g. RangeError)', () => {
      const depBuffer = createDepBuffer();

      const systemErrorDep: Partial<Dependency> = {
        id: 998,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          throw new RangeError('Maximum call stack size exceeded');
        },
        subscribe: vi.fn(() => vi.fn()),
      };

      depBufferPush(depBuffer, createLink(systemErrorDep as Dependency, 1));

      expect(() => isBufferDirty(depBuffer)).toThrow(RangeError);
    });

    it('should mark buffer as dirty on non-system errors thrown during computed dependency evaluation', () => {
      const depBuffer = createDepBuffer();

      const customErrorDep: Partial<Dependency> = {
        id: 999,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          throw new Error('Custom computation error');
        },
        subscribe: vi.fn(() => vi.fn()),
      };

      depBufferPush(depBuffer, createLink(customErrorDep as Dependency, 1));

      expect(isBufferDirty(depBuffer)).toBe(true);
    });

    it('runs untracked if trackingContext.current is active during dirty check', () => {
      const depBuffer = createDepBuffer();
      const depValSpy = vi.fn(() => 42);
      const computedDep: Partial<Dependency> = {
        id: 100,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          return depValSpy();
        },
        subscribe: vi.fn(() => vi.fn()),
      };
      depBufferPush(depBuffer, createLink(computedDep as Dependency, 1));

      const mockContext = {
        addDependency: vi.fn(),
      };

      const originalTrackingContext = trackingContext.current;
      try {
        trackingContext.current = mockContext;
        const isBufferDirtyResult = isBufferDirty(depBuffer);
        expect(isBufferDirtyResult).toBe(false);
        expect(depValSpy).toHaveBeenCalled();
        expect(mockContext.addDependency).not.toHaveBeenCalled();
      } finally {
        trackingContext.current = originalTrackingContext;
      }
    });

    it('handles unsubscribe callback throwing errors during truncation', () => {
      const depBuffer = createDepBuffer();
      const errorThrowingUnsubscribe = () => {
        throw new Error('Unsubscribe failed error');
      };
      depBufferPush(depBuffer, createLink(createMockDep(1), 1, errorThrowingUnsubscribe));

      expect(() => {
        depBufferTruncateFrom(depBuffer, 0);
      }).not.toThrow();
    });
  });
});
