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
    _slots: null,
  };
}

// Helper to create a structure compatible with DependencyLink for internal buffer testing
const createLink = (node: Dependency, version: number, unsub?: () => void): DependencyLink =>
  createDependencyLink(node, version, unsub);

describe('DepBuffer: Reuse & Lifecycle', () => {
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

      const systemErrorDep: Partial<Dependency> = {
        id: 998,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          throw new RangeError('Maximum call stack size exceeded');
        },
        subscribe: vi.fn(() => vi.fn()),
      };

      depBufferPush(buf, createLink(systemErrorDep as Dependency, 1));

      // Calling isBufferDirty should propagate the RangeError, not swallow it
      expect(() => isBufferDirty(buf)).toThrow(RangeError);
    });

    it('isBufferDirty: should propagate non-system errors thrown during computed dependency evaluation', () => {
      const buf = createDepBuffer();

      const customErrorDep: Partial<Dependency> = {
        id: 999,
        version: 1,
        flags: COMPUTED_STATE_FLAGS.IS_COMPUTED,
        get value() {
          throw new Error('Custom computation error');
        },
        subscribe: vi.fn(() => vi.fn()),
      };

      depBufferPush(buf, createLink(customErrorDep as Dependency, 1));

      // Calling isBufferDirty should propagate the custom Error, not swallow it
      expect(() => isBufferDirty(buf)).toThrowError('Custom computation error');
    });
  });
});
