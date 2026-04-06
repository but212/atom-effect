/**
 * @fileoverview Unit tests for DepSlotBuffer.
 */

import { describe, expect, it, vi } from 'vitest';
import { DepSlotBuffer } from '@/core/buffers';
import { DependencyLink } from '@/core/tracking';
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
  _claimViaMap(node: Dependency, index: number): boolean;
  _swapGeneral(idx: number, trackIndex: number, link: DependencyLink): void;
  truncateFrom(index: number): void;
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

  describe('Coverage Gaps', () => {
    it('claimExisting case 0 match', () => {
      const buf = new DepSlotBuffer();
      const dep = createMockDep(0);
      const link = new DependencyLink(dep, 1, vi.fn());
      buf.add(link);

      expect(buf.claimExisting(dep, 0)).toBe(true); // line 66-67
    });

    it('claimExisting case 3 relocations (swaps with 0 or 1)', () => {
      const buf = new DepSlotBuffer();
      const deps = [0, 1, 2, 3].map((id) => createMockDep(id));
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

      // Swap index 3 to 0
      buf.claimExisting(deps[3]!, 0); // line 111-112
      expect(buf.getAt(0)).toBeDefined();

      // Refresh links and test swap index 3 to 1
      buf.truncateFrom(0);
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));
      buf.claimExisting(deps[3]!, 1); // line 114-115
      expect(buf.getAt(1)).toBeDefined();
    });

    it('insertNew overflow lazy initialization and map sync', () => {
      const buf = new DepSlotBuffer();
      const link = new DependencyLink(createMockDep(100), 1, vi.fn());

      // Lazy init overflow (lines 250-251)
      buf.insertNew(4, link);
      expect(buf._overflow).not.toBeNull();

      // Map sync for occupant in overflow (line 238)
      const occupants = [0, 1, 2, 3, 4].map(
        (id) => new DependencyLink(createMockDep(id), 1, vi.fn())
      );
      buf.truncateFrom(0);
      occupants.forEach((o) => buf.add(o));

      // Trigger map creation
      const testBuf = buf as unknown as TestInternalDepSlotBuffer;
      buf.claimExisting(occupants[4]!.node, 4); // Just to have counts right

      // Force map
      (buf as unknown as TestInternalDepSlotBuffer)._claimViaMap(occupants[0]!.node, 0);

      const newLink = new DependencyLink(createMockDep(99), 1, vi.fn());
      buf.insertNew(4, newLink); // Should sync map at line 238
      expect(testBuf._map!.get(occupants[4]!.node)).toBe(5);
    });

    it('claimExisting swap in case 1 and 2', () => {
      const buf = new DepSlotBuffer();
      const deps = [0, 1, 2].map((id) => createMockDep(id));
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

      // Swap s1 to s0
      buf.claimExisting(deps[1]!, 0); // line 76-79
      expect(buf.getAt(0)!.node).toBe(deps[1]);
      expect(buf.getAt(1)!.node).toBe(deps[0]);

      // Swap s2 to s1
      buf.claimExisting(deps[2]!, 1); // line 91-96
      expect(buf.getAt(1)!.node).toBe(deps[2]);
      expect(buf.getAt(2)!.node).toBe(deps[0]);
    });

    it('claimExisting overflow and _claimViaMap branches', () => {
      const buf = new DepSlotBuffer();
      const deps = Array.from({ length: 6 }, (_, i) => createMockDep(i));
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

      const testBuf = buf as unknown as TestInternalDepSlotBuffer;

      // 1. claimExisting overflow search (line 133: trackIndex > 4 ? trackIndex : 4)
      expect(buf.claimExisting(deps[5]!, 5)).toBe(true);

      // 2. _claimViaMap with trackIndex > 0 (lines 156-165)
      testBuf.truncateFrom(0);
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));
      // Trigger map with trackIndex = 2
      testBuf._claimViaMap(deps[2]!, 2);
      expect(testBuf._map!.has(deps[0]!)).toBe(false);
      expect(testBuf._map!.has(deps[1]!)).toBe(false);
      expect(testBuf._map!.has(deps[2]!)).toBe(true);

      // 3. _claimViaMap link with no unsub (line 179)
      const depNoUnsub = createMockDep(99);
      const linkNoUnsub = new DependencyLink(depNoUnsub, 1, undefined);
      buf.add(linkNoUnsub);
      testBuf._map!.set(depNoUnsub, deps.length); // force it into map
      expect(testBuf._claimViaMap(depNoUnsub, deps.length)).toBe(false);

      // 4. _claimViaMap swaps for trackIndex 1, 2, 3 (lines 186-194)
      testBuf.truncateFrom(0);
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));
      testBuf._claimViaMap(deps[1]!, 0); // swap s1 to s0
      testBuf._claimViaMap(deps[2]!, 1); // swap s2 to s1
      testBuf._claimViaMap(deps[3]!, 2); // swap s3 to s2
      testBuf._claimViaMap(deps[5]!, 3); // swap overflow to s3
      expect(buf.getAt(3)!.node).toBe(deps[5]);
    });

    it('_swapGeneral indices for inline slots', () => {
      const buf = new DepSlotBuffer();
      const deps = Array.from({ length: 6 }, (_, i) => createMockDep(i));
      deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

      const testBuf = buf as unknown as TestInternalDepSlotBuffer;

      // Test idx 1, 2, 3 in _swapGeneral (lines 213-216)
      const link1 = buf.getAt(1)!;
      const node0 = buf.getAt(0)!.node;
      testBuf._swapGeneral(1, 0, link1);
      expect(buf.getAt(1)!.node).toBe(node0);

      const link2 = buf.getAt(2)!;
      testBuf._swapGeneral(2, 0, link2);
      const link3 = buf.getAt(3)!;
      testBuf._swapGeneral(3, 0, link3);
    });

    it('insertNew occupant relocation from various slots', () => {
      const buf = new DepSlotBuffer();
      const occupants = Array.from({ length: 6 }, (_, i) => createMockDep(i));
      occupants.forEach((o) => buf.add(new DependencyLink(o, 1, vi.fn())));

      // insertNew at 0 relocates s0 to end (line 227)
      buf.insertNew(0, new DependencyLink(createMockDep(100), 1, vi.fn()));
      expect(buf.getAt(6)!.node).toBe(occupants[0]);

      // insertNew at 5 relocates overflow to end (line 231)
      buf.insertNew(5, new DependencyLink(createMockDep(101), 1, vi.fn()));
      expect(buf.getAt(7)!.node).toBe(occupants[5]);
    });
  });
});
