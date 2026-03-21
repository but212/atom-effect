/**
 * @fileoverview Unit tests for DepSlotBuffer.
 */

import { describe, expect, it, vi } from 'vitest';
import { DepSlotBuffer } from '@/core/dep-slot-buffer';
import { DependencyLink } from '@/core/dep-tracking';
import type { Dependency } from '@/types';

// Mock dependency builder
function createMockDep(id: number): Dependency {
  return {
    id,
    version: 1,
    flags: 0,
    _lastSeenEpoch: -1,
    subscribe: vi.fn(() => vi.fn()),
  } as unknown as Dependency;
}

describe('DepSlotBuffer', () => {
  describe('Inline Slots (≤4 items)', () => {
    it('pushes up to 4 items without overflow allocation', () => {
      const buf = new DepSlotBuffer();
      const links = [1, 2, 3, 4].map((id) => new DependencyLink(createMockDep(id), 1));

      links.forEach((l) => buf.add(l));

      expect(buf.size).toBe(4);
      expect(buf._overflow).toBeNull();
      expect(buf.getAt(0)).toBe(links[0]);
      expect(buf.getAt(3)).toBe(links[3]);
    });

    it('setAt updates inline slots in place', () => {
      const buf = new DepSlotBuffer();
      const link1 = new DependencyLink(createMockDep(1), 1);
      const link2 = new DependencyLink(createMockDep(2), 1);

      buf.setAt(1, link1);
      expect(buf.size).toBe(2);
      expect(buf._s1).toBe(link1);

      buf.setAt(1, link2);
      expect(buf.size).toBe(2);
      expect(buf._s1).toBe(link2);
    });
  });

  describe('Overflow (>4 items)', () => {
    it('allocates overflow array on 5th item', () => {
      const buf = new DepSlotBuffer();
      const links = Array.from({ length: 5 }, (_, i) => new DependencyLink(createMockDep(i), 1));

      links.forEach((l) => buf.add(l));

      expect(buf.size).toBe(5);
      expect(buf._overflow).not.toBeNull();
      expect(buf.getAt(4)).toBe(links[4]);
    });

    it('setAt handles arbitrary overflow indices', () => {
      const buf = new DepSlotBuffer();
      const link = new DependencyLink(createMockDep(1), 1);

      buf.setAt(6, link); // index 6 -> count 7
      expect(buf.size).toBe(7);
      expect(buf._overflow).toHaveLength(3); // 4, 5, 6
      expect(buf.getAt(6)).toBe(link);
    });
  });

  describe('truncateFrom (Logical Tail Deletion)', () => {
    it('unsubscribes and nulls items from index onwards', () => {
      const buf = new DepSlotBuffer();
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();

      buf.add(new DependencyLink(createMockDep(1), 1, unsub1));
      buf.add(new DependencyLink(createMockDep(2), 1, unsub2));

      buf.truncateFrom(1);

      expect(buf.size).toBe(1);
      expect(buf.getAt(1)).toBeNull();
      expect(unsub1).not.toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalledOnce();
    });

    it('clears overflow array properly when truncated to inline slots', () => {
      const buf = new DepSlotBuffer();
      for (let i = 0; i < 6; i++) {
        buf.add(new DependencyLink(createMockDep(i), 1, vi.fn()));
      }

      expect(buf._overflow).not.toBeNull();
      buf.truncateFrom(2);

      expect(buf.size).toBe(2);
      expect(buf._overflow).toBeNull();
    });
  });

  describe('claimExisting & insertNew (Subscription Reuse & Relocation)', () => {
    it('finds existing dependency and swaps it to trackIndex', () => {
      const buf = new DepSlotBuffer();
      const depTarget = createMockDep(2);
      const linkTarget = new DependencyLink(depTarget, 1, vi.fn());

      const occupant = new DependencyLink(createMockDep(1), 1, vi.fn());
      buf.add(occupant); // Original index 0
      buf.add(linkTarget); // Original index 1
      buf.add(new DependencyLink(createMockDep(3), 1, vi.fn())); // Index 2

      depTarget.version = 5; // new version

      // Look for depTarget starting from index 0
      const claimed = buf.claimExisting(depTarget, 0);

      expect(claimed).toBe(true);

      // They should be swapped!
      expect(buf.getAt(0)).toBe(linkTarget);
      expect(buf.getAt(0)?.version).toBe(5);
      expect(buf.getAt(1)).toBe(occupant); // Occupant safely moved appropriately
    });

    it('ignores dependencies before the search index', () => {
      const buf = new DepSlotBuffer();
      const depTarget = createMockDep(1);

      buf.add(new DependencyLink(depTarget, 1, vi.fn()));

      const claimed = buf.claimExisting(depTarget, 1);
      expect(claimed).toBe(false);
      expect(buf.getAt(0)?.node).toBe(depTarget); // Still at 0
    });

    it('insertNew relocates old occupant to the end of the buffer', () => {
      const buf = new DepSlotBuffer();
      const occupant = new DependencyLink(createMockDep(1), 1, vi.fn());
      buf.add(occupant); // index 0

      const newLink = new DependencyLink(createMockDep(99), 1, vi.fn());
      buf.insertNew(0, newLink);

      expect(buf.getAt(0)).toBe(newLink);
      expect(buf.getAt(1)).toBe(occupant); // Occupant safely relocated to the end!
      expect(buf.size).toBe(2);
    });
  });

  describe('disposeAll', () => {
    it('unsubscribes and clears all items', () => {
      const buf = new DepSlotBuffer();
      const unsubs = [vi.fn(), vi.fn(), vi.fn()];

      buf.add(new DependencyLink(createMockDep(1), 1, unsubs[0]));
      buf.add(new DependencyLink(createMockDep(2), 1, unsubs[1]));
      buf.add(new DependencyLink(createMockDep(3), 1, unsubs[2]));

      buf.disposeAll();

      expect(buf.size).toBe(0);
      unsubs.forEach((unsub) => expect(unsub).toHaveBeenCalledOnce());
    });
  });
});
