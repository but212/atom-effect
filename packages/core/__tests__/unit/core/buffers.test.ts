/**
 * @fileoverview DepBuffer Refactored Tests
 * @description High-density verification of core business logic (reuse, lifecycle, logical size).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  claimExisting,
  createDepBuffer,
  depBufferPush,
  depBufferSetAt,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
} from '@/core/buffers';
import { createDependencyLink, type DependencyLink } from '@/core/tracking';
import type { Dependency } from '@/index';

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

  it('claimExisting: should swap and relocate dependencies correctly', () => {
    const buf = createDepBuffer();
    const deps = [0, 1, 2].map((id) => createMockDep(id));
    const links = deps.map((d) => createLink(d, 1, vi.fn()));
    links.forEach((l) => depBufferPush(buf, l));

    // Case 1: Search ahead and swap (index 2 -> index 0)
    expect(claimExisting(buf, deps[2]!, 0)).toBe(true);
    expect(buf.slots.at(0)).toBe(links[2]);
    expect(buf.slots.at(2)).toBe(links[0]);

    // Case 2: Out of range search
    expect(claimExisting(buf, createMockDep(99), 0)).toBe(false);
  });

  it('Map Optimization: should maintain index integrity during large-scale reuse', () => {
    const buf = createDepBuffer();
    const count = 40; // Beyond threshold (32)
    const deps = Array.from({ length: count }, (_, i) => createMockDep(i));
    deps.forEach((d) => depBufferPush(buf, createLink(d, 1, vi.fn())));

    // Verify index accuracy and swapping after Map creation
    expect(claimExisting(buf, deps[39]!, 0)).toBe(true);
    expect(buf.slots.at(0)?.node).toBe(deps[39]);

    // Regression test: Map index synchronization during hole reuse
    depBufferSetAt(buf, 1, null);
    const newDep = createMockDep(100);
    const newLink = createLink(newDep, 1, vi.fn());
    depBufferPush(buf, newLink); // Reuse index 1

    expect(claimExisting(buf, newDep, 0)).toBe(true);
    expect(buf.slots.at(0)).toBe(newLink);
  });

  it('Lifecycle: truncateFrom & disposeAll must trigger unsubscriptions', () => {
    const buf = createDepBuffer();
    const unsubs = [vi.fn(), vi.fn(), vi.fn()];
    unsubs.forEach((u, i) => depBufferPush(buf, createLink(createMockDep(i), 1, u)));

    depBufferTruncateFrom(buf, 1); // Removes index 1, 2
    expect(unsubs[0]).not.toHaveBeenCalled();
    expect(unsubs[1]).toHaveBeenCalled();
    expect(unsubs[2]).toHaveBeenCalled();

    disposeAll(buf);
    expect(unsubs[0]).toHaveBeenCalled();
    expect(buf.slots.length).toBe(0);
  });

  it('insertNew: should correctly manage logical size irrespective of occupancy', () => {
    const buf = createDepBuffer();
    const l0 = createLink(createMockDep(0), 1, vi.fn());

    // 1. Write to empty slot (logical size 0 -> 1)
    insertNew(buf, 2, l0);
    expect(buf.slots.length).toBe(1);

    // 2. Write to occupied slot (relocate l0, write l1 -> logical size 1 -> 2)
    const l1 = createLink(createMockDep(1), 1, vi.fn());
    insertNew(buf, 2, l1);
    expect(buf.slots.length).toBe(2);
    expect(buf.slots.at(2)).toBe(l1);
    expect(buf.slots.has(l0)).toBe(true); // Occupant must be relocated, not deleted
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
    expect(buf.slots.at(0)).toBe(l0_a);

    // 2. Should find the next instance ahead
    expect(claimExisting(buf, d0, 1)).toBe(true);
    expect(buf.slots.at(1)).toBe(l0_b);
  });

  it('claimExisting: Map lookup must find matching dependencies in valid range', () => {
    const buf = createDepBuffer();
    const d0 = createMockDep(0);
    // Fill beyond threshold
    const links = Array.from({ length: 40 }, (_, i) => {
      const dep = i === 5 || i === 35 ? d0 : createMockDep(i + 100);
      return createLink(dep, 1, vi.fn());
    });
    links.forEach((l) => depBufferPush(buf, l));
    claimExisting(buf, createMockDep(999), 0); // Trigger Map

    // Search for d0 from trackIndex 10.
    // Index 5 is behind, index 35 is ahead.
    expect(claimExisting(buf, d0, 10)).toBe(true);
    expect(buf.slots.at(10)?.node).toBe(d0);
  });

  it('insertNew: repeated insertion into same empty slot should not inflate size', () => {
    const buf = createDepBuffer();
    const d0 = createMockDep(0);
    const d1 = createMockDep(1);

    insertNew(buf, 0, createLink(d0, 1, vi.fn()));
    expect(buf.slots.length).toBe(1);

    depBufferTruncateFrom(buf, 0);
    expect(buf.slots.length).toBe(0);

    insertNew(buf, 0, createLink(d1, 1, vi.fn()));
    expect(buf.slots.length).toBe(1);
  });
});
