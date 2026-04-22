/**
 * @fileoverview SlotBuffer & DepSlotBuffer Refactored Tests
 * @description High-density verification of core business logic (reuse, lifecycle, logical size).
 */

import { describe, expect, it, vi } from 'vitest';
import { DepSlotBuffer, SlotBuffer } from '@/core/buffers';
import { DependencyLink } from '@/core/tracking';
import type { Dependency } from '@/types';

describe('SlotBuffer: Structural Integrity', () => {
  it('should synchronize logical size and physical high-water mark (including holes)', () => {
    const buf = new SlotBuffer<number>();

    // 1. Initial additions and physical boundary expansion
    [0, 1, 2].forEach((i) => buf.push(i));
    expect(buf.length).toBe(3);
    expect(buf.capacity).toBe(3);

    // 2. Removal in the middle: only logical size decreases (hole created)
    buf.remove(1);
    expect(buf.length).toBe(2);
    expect(buf.capacity).toBe(3); // Maintained because index 2 still has data

    // 3. Verify hole reuse
    buf.push(99);
    expect(buf.at(1)).toBe(99);
    expect(buf.length).toBe(3);

    // 4. Iteration: skip holes and execute exactly 'size' times
    buf.remove(99); // [0, null, 2]
    const collected: number[] = [];
    buf.forEach((item) => collected.push(item));
    expect(collected).toEqual([0, 2]);
  });

  it('compact() should eliminate holes and reset physical boundaries', () => {
    const buf = new SlotBuffer<number>();
    for (let i = 0; i < 5; i++) buf.push(i);
    buf.remove(1); // [0, null, 2, 3, 4]
    buf.remove(4); // [0, null, 2, 3, null]

    buf.compact();
    expect(buf.length).toBe(3);
    expect(buf.capacity).toBe(3);
    expect([0, 1, 2].map((i) => buf.at(i))).toEqual([0, 2, 3]);
    expect(buf.at(3)).toBeNull();
  });

  it('setAt() & truncateFrom() should manage boundary safety', () => {
    const buf = new SlotBuffer<string>();
    buf.setAt(10, 'far');
    expect(buf.length).toBe(1);
    expect(buf.capacity).toBe(11);

    buf.setAt(10, null);
    expect(buf.capacity).toBeLessThan(11);

    buf.truncateFrom(5);
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(5);
  });
});

describe('DepSlotBuffer: Reuse & Lifecycle', () => {
  const createMockDep = (id: number): Dependency =>
    ({
      id,
      version: 1,
      flags: 0,
      _lastSeenEpoch: -1,
      subscribe: vi.fn(() => vi.fn()),
    }) as unknown as Dependency;

  it('claimExisting: should swap and relocate dependencies correctly', () => {
    const buf = new DepSlotBuffer();
    const deps = [0, 1, 2].map((id) => createMockDep(id));
    const links = deps.map((d) => new DependencyLink(d, 1, vi.fn()));
    links.forEach((l) => buf.push(l));

    // Case 1: Search ahead and swap (index 2 -> index 0)
    expect(buf.claimExisting(deps[2]!, 0)).toBe(true);
    expect(buf.at(0)).toBe(links[2]);
    expect(buf.at(2)).toBe(links[0]);

    // Case 2: Out of range search
    expect(buf.claimExisting(createMockDep(99), 0)).toBe(false);
  });

  it('Map Optimization: should maintain index integrity during large-scale reuse', () => {
    const buf = new DepSlotBuffer();
    const count = 40; // Beyond threshold (32)
    const deps = Array.from({ length: count }, (_, i) => createMockDep(i));
    deps.forEach((d) => buf.push(new DependencyLink(d, 1, vi.fn())));

    // Verify index accuracy and swapping after Map creation
    expect(buf.claimExisting(deps[39]!, 0)).toBe(true);
    expect(buf.at(0)?.node).toBe(deps[39]);

    // Regression test: Map index synchronization during hole reuse
    buf.setAt(1, null);
    const newDep = createMockDep(100);
    const newLink = new DependencyLink(newDep, 1, vi.fn());
    buf.push(newLink); // Reuse index 1

    expect(buf.claimExisting(newDep, 0)).toBe(true);
    expect(buf.at(0)).toBe(newLink);
  });

  it('Lifecycle: truncateFrom & disposeAll must trigger unsubscriptions', () => {
    const buf = new DepSlotBuffer();
    const unsubs = [vi.fn(), vi.fn(), vi.fn()];
    unsubs.forEach((u, i) => buf.push(new DependencyLink(createMockDep(i), 1, u)));

    buf.truncateFrom(1); // Removes index 1, 2
    expect(unsubs[0]).not.toHaveBeenCalled();
    expect(unsubs[1]).toHaveBeenCalled();
    expect(unsubs[2]).toHaveBeenCalled();

    buf.disposeAll();
    expect(unsubs[0]).toHaveBeenCalled();
    expect(buf.length).toBe(0);
  });

  it('Safety Guards: should prevent illegal operations', () => {
    const buf = new DepSlotBuffer();
    const link = new DependencyLink(createMockDep(1), 1);
    expect(() => buf.remove(link)).toThrow('remove() prohibited');
    expect(() => buf.compact()).not.toThrow();
  });

  it('insertNew: should correctly manage logical size irrespective of occupancy', () => {
    const buf = new DepSlotBuffer();
    const l0 = new DependencyLink(createMockDep(0), 1, vi.fn());

    // 1. Write to empty slot (logical size 0 -> 1)
    buf.insertNew(2, l0);
    expect(buf.length).toBe(1);

    // 2. Write to occupied slot (relocate l0, write l1 -> logical size 1 -> 2)
    const l1 = new DependencyLink(createMockDep(1), 1, vi.fn());
    buf.insertNew(2, l1);
    expect(buf.length).toBe(2);
    expect(buf.at(2)).toBe(l1);
    expect(buf.has(l0)).toBe(true); // Occupant must be relocated, not deleted
  });

  it('claimExisting: behavior with duplicate dependencies', () => {
    const buf = new DepSlotBuffer();
    const d0 = createMockDep(0);
    const l0_a = new DependencyLink(d0, 1, vi.fn());
    const l0_b = new DependencyLink(d0, 1, vi.fn());

    buf.push(l0_a);
    buf.push(l0_b);

    // 1. Should hit the first instance at trackIndex
    expect(buf.claimExisting(d0, 0)).toBe(true);
    expect(buf.at(0)).toBe(l0_a);

    // 2. Should find the next instance ahead
    expect(buf.claimExisting(d0, 1)).toBe(true);
    expect(buf.at(1)).toBe(l0_b);
  });

  it('claimExisting: Map lookup must find matching dependencies in valid range', () => {
    const buf = new DepSlotBuffer();
    const d0 = createMockDep(0);
    // Fill beyond threshold
    const links = Array.from({ length: 40 }, (_, i) => {
      const dep = i === 5 || i === 35 ? d0 : createMockDep(i + 100);
      return new DependencyLink(dep, 1, vi.fn());
    });
    links.forEach((l) => buf.push(l));
    buf.claimExisting(createMockDep(999), 0); // Trigger Map

    // Search for d0 from trackIndex 10.
    // Index 5 is behind, index 35 is ahead.
    expect(buf.claimExisting(d0, 10)).toBe(true);
    expect(buf.at(10)?.node).toBe(d0);
  });

  it('insertNew: repeated insertion into same empty slot should not inflate size', () => {
    const buf = new DepSlotBuffer();
    const d0 = createMockDep(0);
    const d1 = createMockDep(1);

    buf.insertNew(0, new DependencyLink(d0, 1, vi.fn()));
    expect(buf.length).toBe(1);

    buf.truncateFrom(0);
    expect(buf.length).toBe(0);

    buf.insertNew(0, new DependencyLink(d1, 1, vi.fn()));
    expect(buf.length).toBe(1);
  });
});
