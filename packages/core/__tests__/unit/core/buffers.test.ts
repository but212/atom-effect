/**
 * @fileoverview DepBuffer Refactored Tests
 * @description High-density verification of core business logic (reuse, lifecycle, logical size).
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { describe, expect, it, vi } from 'vitest';
import { COMPUTED_STATE_FLAGS } from '@/constants';
import { createDependencyLink } from '@/core/base';
import {
  BUFFER_FLAGS,
  claimExisting,
  depBufferPush,
  depBufferSetAt,
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
    _depMap: null,
    _depFlags: BUFFER_FLAGS.NONE,
    flags: 0,
    version: 0,
    _lastSeenEpoch: 0,
    _nextEpoch: undefined,
    _trackCount: 0,
    _trackEpoch: 0,
    _error: null,
    isRejected: false,
    id: 1,
    _slots: null,
  };
}

// Helper to create a structure compatible with DependencyLink for internal buffer testing
const createLink = (node: Dependency, version: number, unsub?: () => void): DependencyLink =>
  createDependencyLink(node, version, unsub);

describe('DepBuffer: Reuse & Lifecycle', () => {
  const createMockDep = (id: number): Dependency =>
    ({
      id,
      version: 1,
      flags: 0,
      _lastSeenEpoch: -1,
      subscribe: vi.fn(() => vi.fn()),
    }) as unknown as Dependency;

  describe('Basic Operations', () => {
    it('claimExisting: should swap and relocate dependencies correctly', () => {
      const buf = createDepBuffer();
      const deps = [0, 1, 2].map((id) => createMockDep(id));
      const [d0, d1, d2] = deps;
      if (!d0 || !d1 || !d2) throw new Error('Setup failed');
      const links = deps.map((d) => createLink(d, 1, vi.fn()));
      for (const l of links) {
        depBufferPush(buf, l);
      }

      // Case 1: Search ahead and swap (index 2 -> index 0)
      expect(claimExisting(buf, d2, 0)).toBe(true);
      expect(buf._depSlots.at(0)).toBe(links[2]);
      expect(buf._depSlots.at(2)).toBe(links[0]);

      // Case 2: Out of range search
      expect(claimExisting(buf, createMockDep(99), 0)).toBe(false);
    });

    it('claimExisting: behavior with duplicate dependencies', () => {
      const buf = createDepBuffer();
      const d0 = createMockDep(0);
      const l0_a = createLink(d0, 1, vi.fn());
      const l0_b = createLink(d0, 1, vi.fn());

      depBufferPush(buf, l0_a);
      depBufferPush(buf, l0_b);

      // 1. Should hit the first instance at trackIndex
      expect(claimExisting(buf, d0, 0)).toBe(true);
      expect(buf._depSlots.at(0)).toBe(l0_a);

      // 2. Should find the next instance ahead
      expect(claimExisting(buf, d0, 1)).toBe(true);
      expect(buf._depSlots.at(1)).toBe(l0_b);
    });

    it('insertNew: should correctly manage logical size irrespective of occupancy', () => {
      const buf = createDepBuffer();
      const l0 = createLink(createMockDep(0), 1, vi.fn());

      // 1. Write to empty slot (logical size 0 -> 1)
      insertNew(buf, 2, l0);
      expect(buf._depSlots.size).toBe(1);

      // 2. Write to occupied slot (relocate l0, write l1 -> logical size 1 -> 2)
      const l1 = createLink(createMockDep(1), 1, vi.fn());
      insertNew(buf, 2, l1);
      expect(buf._depSlots.size).toBe(2);
      expect(buf._depSlots.at(2)).toBe(l1);
      expect(buf._depSlots.has(l0)).toBe(true); // Occupant must be relocated, not deleted
    });

    it('insertNew: repeated insertion into same empty slot should not inflate size', () => {
      const buf = createDepBuffer();
      const d0 = createMockDep(0);
      const d1 = createMockDep(1);

      insertNew(buf, 0, createLink(d0, 1, vi.fn()));
      expect(buf._depSlots.size).toBe(1);

      depBufferTruncateFrom(buf, 0);
      expect(buf._depSlots.size).toBe(0);

      insertNew(buf, 0, createLink(d1, 1, vi.fn()));
      expect(buf._depSlots.size).toBe(1);
    });
  });

  describe('Map Lookup Optimization', () => {
    it('Map Optimization: should maintain index integrity during large-scale reuse', () => {
      const buf = createDepBuffer();
      const count = 40; // Beyond threshold (8)
      const deps = Array.from({ length: count }, (_, i) => createMockDep(i));
      for (const d of deps) {
        depBufferPush(buf, createLink(d, 1, vi.fn()));
      }

      // Verify index accuracy and swapping after Map creation
      const dep39 = deps[39];
      if (!dep39) throw new Error('Setup failed');
      expect(claimExisting(buf, dep39, 0)).toBe(true);
      expect(buf._depSlots.at(0)?.node).toBe(dep39);

      // Regression test: Map index synchronization during hole reuse
      depBufferSetAt(buf, 1, null);
      const newDep = createMockDep(100);
      const newLink = createLink(newDep, 1, vi.fn());
      depBufferPush(buf, newLink); // Reuse index 1

      expect(claimExisting(buf, newDep, 0)).toBe(true);
      expect(buf._depSlots.at(0)).toBe(newLink);
    });

    it('claimExisting: Map lookup must find matching dependencies in valid range', () => {
      const buf = createDepBuffer();
      const d0 = createMockDep(0);
      // Fill beyond threshold
      const links = Array.from({ length: 40 }, (_, i) => {
        const dep = i === 5 || i === 35 ? d0 : createMockDep(i + 100);
        return createLink(dep, 1, vi.fn());
      });
      for (const l of links) {
        depBufferPush(buf, l);
      }
      claimExisting(buf, createMockDep(999), 0); // Trigger Map

      // Search for d0 from trackIndex 10.
      // Index 5 is behind, index 35 is ahead.
      expect(claimExisting(buf, d0, 10)).toBe(true);
      expect(buf._depSlots.at(10)?.node).toBe(d0);
    });
  });

  describe('Map Integrity & Duplicate Dependencies', () => {
    it('Map Integrity: depBufferSetAt should not delete a duplicate dependency from the map if it still exists elsewhere', () => {
      const buf = createDepBuffer();
      const depA = createMockDep(100);
      const depB = createMockDep(200);

      // Push 9 elements to exceed MAP_THRESHOLD (8) and initialize map
      const deps = [
        createMockDep(1),
        depA,
        createMockDep(2),
        createMockDep(3),
        createMockDep(4),
        createMockDep(5),
        createMockDep(6),
        depB,
        depA,
      ];
      for (const d of deps) {
        depBufferPush(buf, createLink(d, 1, vi.fn()));
      }

      expect(buf._depMap).not.toBeNull();
      expect(buf._depMap?.get(depA)).toBe(8);

      // Overwrite index 8 with null, which triggers map index update
      depBufferSetAt(buf, 8, null);

      // depA still exists at index 1, so claimExisting should find it
      const claimed = claimExisting(buf, depA, 0);
      expect(claimed).toBe(true);
      expect(buf._depSlots.at(0)?.node).toBe(depA);
    });

    it('Map Integrity: depBufferTruncateFrom should not delete a duplicate dependency from the map if it still exists at a non-truncated index', () => {
      const buf = createDepBuffer();
      const depA = createMockDep(100);

      // Push 12 elements to exceed threshold (8) and initialize map
      const deps = [
        createMockDep(1), // 0
        depA, // 1
        createMockDep(2), // 2
        createMockDep(3), // 3
        createMockDep(4), // 4
        createMockDep(5), // 5
        createMockDep(6), // 6
        createMockDep(7), // 7
        createMockDep(8), // 8
        createMockDep(9), // 9
        createMockDep(10), // 10
        depA, // 11
      ];
      for (const d of deps) {
        depBufferPush(buf, createLink(d, 1, vi.fn()));
      }

      expect(buf._depMap?.get(depA)).toBe(11);

      // Truncate from 11. Since 11 > MAP_THRESHOLD (8), map is not discarded.
      depBufferTruncateFrom(buf, 11);

      // depA still exists at index 1, so claimExisting should find it
      const claimed = claimExisting(buf, depA, 0);
      expect(claimed).toBe(true);
      expect(buf._depSlots.at(0)?.node).toBe(depA);
    });

    it('Map Integrity: claimExisting swap should not downgrade the map index of the swapped element if it exists at a higher index', () => {
      const buf = createDepBuffer();
      const depA = createMockDep(100);
      const depB = createMockDep(200);

      // Push 9 elements to initialize map
      const deps = [
        depB, // 0
        depA, // 1
        depB, // 2
        createMockDep(3), // 3
        createMockDep(4), // 4
        createMockDep(5), // 5
        createMockDep(6), // 6
        createMockDep(7), // 7
        createMockDep(8), // 8
      ];
      for (const d of deps) {
        depBufferPush(buf, createLink(d, 1, vi.fn()));
      }

      expect(buf._depMap?.get(depB)).toBe(2);

      // Claim depA at trackIndex 0 (swapping depA from index 1 to 0, and depB from 0 to 1)
      claimExisting(buf, depA, 0);

      // B still exists at index 2 (higher than 1), so map index for B should remain 2.
      expect(buf._depMap?.get(depB)).toBe(2);

      // Overwrite index 1 with null
      depBufferSetAt(buf, 1, null);

      // Since B was not downgraded to 1, overwriting index 1 should not delete B from map.
      expect(buf._depMap?.get(depB)).toBe(2);

      // claimExisting for B should find B at index 2
      const claimed = claimExisting(buf, depB, 0);
      expect(claimed).toBe(true);
      expect(buf._depSlots.at(0)?.node).toBe(depB);
    });
  });

  describe('Lifecycle & Disposal', () => {
    it('Lifecycle: truncateFrom & disposeAll must trigger unsubscriptions', () => {
      const buf = createDepBuffer();
      const unsubs = [vi.fn(), vi.fn(), vi.fn()];
      for (let i = 0; i < unsubs.length; i++) {
        const u = unsubs[i];
        if (u) {
          depBufferPush(buf, createLink(createMockDep(i), 1, u));
        }
      }

      depBufferTruncateFrom(buf, 1); // Removes index 1, 2
      expect(unsubs[0]).not.toHaveBeenCalled();
      expect(unsubs[1]).toHaveBeenCalled();
      expect(unsubs[2]).toHaveBeenCalled();

      disposeAll(buf);
      expect(unsubs[0]).toHaveBeenCalled();
      expect(buf._depSlots.size).toBe(0);
    });
  });

  describe('Error Propagation', () => {
    it('isBufferDirty: should not swallow system-level exceptions', () => {
      const buf = createDepBuffer();

      const systemErrorDep = {
        id: 999,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          throw new RangeError('Maximum call stack size exceeded');
        },
        subscribe: vi.fn(() => vi.fn()),
      } as unknown as Dependency;

      depBufferPush(buf, createLink(systemErrorDep, 1));

      // Calling isBufferDirty should propagate the RangeError, not swallow it
      expect(() => isBufferDirty(buf)).toThrow(RangeError);
    });

    it('isBufferDirty: should propagate non-system errors thrown during computed dependency evaluation', () => {
      const buf = createDepBuffer();

      const customErrorDep = {
        id: 999,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          throw new Error('Custom computation error');
        },
        subscribe: vi.fn(() => vi.fn()),
      } as unknown as Dependency;

      depBufferPush(buf, createLink(customErrorDep, 1));

      // Calling isBufferDirty should propagate the custom Error, not swallow it
      expect(() => isBufferDirty(buf)).toThrowError('Custom computation error');
    });
  });
});
