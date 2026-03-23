/**
 * @fileoverview Unit tests for DepSlotBuffer.
 */

import { describe, expect, it, vi } from 'vitest';
import { DependencyLink } from '@/core/dep-tracking';
import { DepSlotBuffer } from '@/internal/dep-slot-buffer';
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

/**
 * Internal interface for testing private members of DepSlotBuffer.
 */
interface TestInternalDepSlotBuffer {
  _map: Map<Dependency, number> | null;
  _s0: DependencyLink | null;
  _s1: DependencyLink | null;
  _s2: DependencyLink | null;
  _s3: DependencyLink | null;
  _depsHash: number;
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
    it('finds existing dependency and swaps it to trackIndex (Inline Slots 1-3)', () => {
      const buf = new DepSlotBuffer();

      // Test swaps for slots 1, 2, 3
      const deps = [0, 1, 2, 3].map((id) => createMockDep(id));
      const links = deps.map((d) => new DependencyLink(d, 1, vi.fn()));
      links.forEach((l) => buf.add(l));

      // 1. Swap index 1 to 0
      buf.claimExisting(deps[1]!, 0);
      expect(buf.getAt(0)).toBe(links[1]);
      expect(buf.getAt(1)).toBe(links[0]);

      // 2. Swap index 2 to 1
      buf.claimExisting(deps[2]!, 1);
      expect(buf.getAt(1)).toBe(links[2]);
      expect(buf.getAt(2)).toBe(links[0]);

      // 3. Swap index 3 to 2
      buf.claimExisting(deps[3]!, 2);
      expect(buf.getAt(2)).toBe(links[3]);
      expect(buf.getAt(3)).toBe(links[0]);
    });

    it('finds existing dependency and swaps it to trackIndex (Overflow)', () => {
      const buf = new DepSlotBuffer();
      const deps = Array.from({ length: 6 }, (_, i) => createMockDep(i));
      const links = deps.map((d) => new DependencyLink(d, 1, vi.fn()));
      links.forEach((l) => buf.add(l));

      // Swap overflow index 5 to 4
      buf.claimExisting(deps[5]!, 4);
      expect(buf.getAt(4)).toBe(links[5]);
      expect(buf.getAt(5)).toBe(links[4]);
    });

    it('finds existing dependency and swaps it to trackIndex (Mega-Node / Map)', () => {
      const buf = new DepSlotBuffer();
      // Increase threshold to trigger Map (threshold = 32)
      const deps = Array.from({ length: 40 }, (_, i) => createMockDep(i));
      const links = deps.map((d) => new DependencyLink(d, 1, vi.fn()));
      links.forEach((l) => buf.add(l));

      // Initial search triggers Map creation (remaining = 40 - 5 = 35 > 32)
      const claimed = buf.claimExisting(deps[39]!, 5);
      expect(claimed).toBe(true);
      expect(buf.getAt(5)).toBe(links[39]);
      expect((buf as unknown as TestInternalDepSlotBuffer)._map).not.toBeNull();

      // Subsequent search uses Map
      const claimed2 = buf.claimExisting(deps[38]!, 6);
      expect(claimed2).toBe(true);
      expect(buf.getAt(6)).toBe(links[38]);

      // Search for non-existent or already claimed (before trackIndex)
      expect(buf.claimExisting(deps[0]!, 6)).toBe(false);
    });

    it('ignores items with missing unsubscriptions (dead/legacy links)', () => {
      const buf = new DepSlotBuffer();
      const dep = createMockDep(1);
      const link = new DependencyLink(dep, 1, undefined); // No unsub
      buf.add(link);

      expect(buf.claimExisting(dep, 0)).toBe(false);
    });

    it('insertNew relocates old occupant to the end (Slots 1, 2, 3, Overflow)', () => {
      const buf = new DepSlotBuffer();
      const occupants = [0, 1, 2, 3, 4].map(
        (id) => new DependencyLink(createMockDep(id), 1, vi.fn())
      );
      occupants.forEach((o) => buf.add(o));

      const newLinks = [90, 91, 92, 93, 100].map(
        (id) => new DependencyLink(createMockDep(id), 1, vi.fn())
      );

      buf.insertNew(1, newLinks[1]!);
      expect((buf as unknown as TestInternalDepSlotBuffer)._s1).toBe(newLinks[1]);
      expect(buf.getAt(5)).toBe(occupants[1]);

      buf.insertNew(2, newLinks[2]!);
      expect((buf as unknown as TestInternalDepSlotBuffer)._s2).toBe(newLinks[2]);
      expect(buf.getAt(6)).toBe(occupants[2]);

      buf.insertNew(3, newLinks[3]!);
      expect((buf as unknown as TestInternalDepSlotBuffer)._s3).toBe(newLinks[3]);
      expect(buf.getAt(7)).toBe(occupants[3]);

      buf.insertNew(4, newLinks[4]!);
      expect(buf.getAt(4)).toBe(newLinks[4]);
      expect(buf.getAt(8)).toBe(occupants[4]);
    });
  });

  describe('disposeAll & prepareTracking', () => {
    it('prepareTracking resets metadata', () => {
      const buf = new DepSlotBuffer();
      buf.hasComputeds = true;
      buf.prepareTracking();
      expect(buf.hasComputeds).toBe(false);
    });

    it('disposeAll cleans up Map', () => {
      const buf = new DepSlotBuffer();
      const deps = Array.from({ length: 40 }, (_, i) => createMockDep(i));
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

      buf.claimExisting(deps[39]!, 0); // Trigger Map
      expect((buf as unknown as TestInternalDepSlotBuffer)._map).not.toBeNull();

      buf.disposeAll();
      expect((buf as unknown as TestInternalDepSlotBuffer)._map).toBeNull();
      expect(buf.size).toBe(0);
    });
  });

  describe('Versioning and Hashing (Boundary Checks)', () => {
    it('handles exact boundary counts: 1, 2, 3, 4, >4', () => {
      const buf = new DepSlotBuffer();
      const deps = [1, 2, 3, 4, 5].map((id) => {
        const d = createMockDep(id);
        d.version = id;
        return d;
      });

      // 1 item
      buf.add(new DependencyLink(deps[0]!, deps[0]!.version));
      buf.seal();
      expect(buf.isDirtyFast()).toBe(false);
      expect(buf.captureVersionSnapshot()).not.toBe(0);

      // 2 items
      buf.add(new DependencyLink(deps[1]!, deps[1]!.version));
      buf.seal();
      expect(buf.isDirtyFast()).toBe(false);

      // 3 items
      buf.add(new DependencyLink(deps[2]!, deps[2]!.version));
      buf.seal();
      expect(buf.isDirtyFast()).toBe(false);

      // 4 items
      buf.add(new DependencyLink(deps[3]!, deps[3]!.version));
      buf.seal();
      expect(buf.isDirtyFast()).toBe(false);

      // 5 items (overflow)
      buf.add(new DependencyLink(deps[4]!, deps[4]!.version));
      buf.seal();
      expect(buf.isDirtyFast()).toBe(false);

      // Verify dirty detection in overflow
      deps[4]!.version++;
      expect(buf.isDirtyFast()).toBe(true);
      expect(buf.captureVersionSnapshot()).not.toBe(0);
    });

    it('seal and isDirtyFast handle empty buffer gracefully', () => {
      const buf = new DepSlotBuffer();
      buf.seal();
      expect((buf as unknown as TestInternalDepSlotBuffer)._depsHash).toBe(0);
      expect(buf.isDirtyFast()).toBe(false);
      expect(buf.captureVersionSnapshot()).toBe(0);
    });

    it('Sum hash handles multiple dependencies and is order-independent', () => {
      const buf = new DepSlotBuffer();
      const dep1 = createMockDep(1);
      const dep2 = createMockDep(2);

      buf.add(new DependencyLink(dep1, dep1.version));
      buf.add(new DependencyLink(dep2, dep2.version));
      buf.seal();

      dep1.version++;
      dep2.version++;
      expect(buf.isDirtyFast()).toBe(true);

      dep1.version--;
      dep2.version--;
      expect(buf.isDirtyFast()).toBe(false);
    });
  });

  describe('Safety Guards', () => {
    it('prohibits remove()', () => {
      const buf = new DepSlotBuffer();
      expect(() => buf.remove(new DependencyLink(createMockDep(1), 1))).toThrow();
    });

    it('compact() is a no-op', () => {
      const buf = new DepSlotBuffer();
      expect(() => buf.compact()).not.toThrow();
    });
  });
});
