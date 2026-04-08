/**
 * @fileoverview SlotBuffer & DepSlotBuffer Unit Tests
 * @description Verifies storage, iteration, deletion, and reactive dependency management.
 */

import { describe, expect, it, vi } from 'vitest';
import { DepSlotBuffer, SlotBuffer } from '@/core/buffers';
import { DependencyLink } from '@/core/tracking';
import type { Dependency } from '@/types';

// ── Test Utilities ──────────────────────────────────────────────────────

function createMockDep(id: number): Dependency {
  return {
    id,
    version: 1,
    flags: 0,
    _lastSeenEpoch: -1,
    subscribe: vi.fn(() => vi.fn()),
  } as unknown as Dependency;
}

// ── SlotBuffer Tests ────────────────────────────────────────────────────

describe('SlotBuffer', () => {
  it('should handle basic storage and retrieval (Inline & Overflow)', () => {
    const buf = new SlotBuffer<string>();

    // Initial state
    expect(buf.size).toBe(0);
    expect(buf.getAt(0)).toBeNull();

    // Inline slots (0-3)
    ['a', 'b', 'c', 'd'].forEach((v) => buf.add(v));
    expect(buf.size).toBe(4);
    expect(buf.getAt(0)).toBe('a');
    expect(buf.getAt(3)).toBe('d');

    // Overflow spill (4+)
    buf.add('e');
    expect(buf.size).toBe(5);
    expect(buf.getAt(4)).toBe('e');

    // Sparse setAt
    buf.setAt(10, 'z');
    expect(buf.size).toBe(6);
    expect(buf.getAt(10)).toBe('z');
    expect(buf.getAt(9)).toBeNull();
  });

  it('should handle iteration over non-null elements', () => {
    const buf = new SlotBuffer<number>();
    [0, 1, 2, 3, 4, 5].forEach((i) => buf.add(i));
    buf.remove(2); // Remove from inline
    buf.remove(4); // Remove from overflow

    const results: number[] = [];
    buf.forEach((val) => results.push(val));
    expect(results).toEqual([0, 1, 3, 5]);

    const indexedResults: number[] = [];
    const count = buf.forEachIndexed((val) => indexedResults.push(val));
    expect(count).toBe(4);
    expect(indexedResults).toEqual([0, 1, 3, 5]);
  });

  it('should handle logical deletion, compaction, and reuse', () => {
    const buf = new SlotBuffer<string>();
    buf.add('a');
    buf.add('b');

    // Existence check
    expect(buf.has('a')).toBe(true);
    expect(buf.has('z')).toBe(false);

    // Logical delete
    expect(buf.remove('a')).toBe(true);
    expect(buf.size).toBe(1);
    expect(buf.has('a')).toBe(false);

    // Reuse gap
    buf.add('new');
    expect(buf.getAt(0)).toBe('new');
    expect(buf.size).toBe(2);

    // Compaction side-effects
    for (let i = 0; i < 5; i++) buf.add(`ov-${i}`);
    buf.remove('ov-0');
    buf.compact();
    expect(buf.size).toBe(6); // 2 inline + 4 overflow
    expect(buf.has('ov-0')).toBe(false);
  });

  it('should handle truncation and full cleanup', () => {
    const buf = new SlotBuffer<number>();
    for (let i = 0; i < 10; i++) buf.add(i);

    // Partial truncate
    buf.truncateFrom(5);
    expect(buf.size).toBe(5);
    expect(buf.getAt(5)).toBeNull();

    // Clear and Reuse
    buf.clear();
    expect(buf.size).toBe(0);
    buf.add(99);
    expect(buf.getAt(0)).toBe(99);

    // Dispose
    buf.dispose();
    expect(buf.size).toBe(0);
  });
});

// ── DepSlotBuffer Tests ──────────────────────────────────────────────────

describe('DepSlotBuffer', () => {
  it('should handle reactive link lifecycle and unsubscriptions', () => {
    const buf = new DepSlotBuffer();
    const unsub = vi.fn();
    const link = new DependencyLink(createMockDep(1), 1, unsub);

    buf.add(link);
    expect(buf.size).toBe(1);

    // truncateFrom should trigger unsub
    buf.truncateFrom(0);
    expect(buf.size).toBe(0);
    expect(unsub).toHaveBeenCalledOnce();
  });

  it('should claim and relocate existing dependencies (In-place updates)', () => {
    const buf = new DepSlotBuffer();
    const deps = [0, 1, 2, 3, 4, 5].map(createMockDep);
    const links = deps.map((d) => new DependencyLink(d, 1, vi.fn()));
    links.forEach((l) => buf.add(l));

    // Case: Swap inline (2 -> 0)
    expect(buf.claimExisting(deps[2]!, 0)).toBe(true);
    expect(buf.getAt(0)).toBe(links[2]);
    expect(buf.getAt(2)).toBe(links[0]);

    // Case: Swap overflow to inline (5 -> 1)
    expect(buf.claimExisting(deps[5]!, 1)).toBe(true);
    expect(buf.getAt(1)).toBe(links[5]);
    expect(buf.getAt(5)).toBe(links[1]); // links[1] was at index 1

    // Case: Not found or dead link
    expect(buf.claimExisting(createMockDep(99), 0)).toBe(false);

    const deadLink = new DependencyLink(createMockDep(88), 1, undefined);
    buf.add(deadLink);
    expect(buf.claimExisting(deadLink.node, 0)).toBe(false); // missing unsub
  });

  it('should optimize mega-nodes via hybrid Map fallback', () => {
    const buf = new DepSlotBuffer();
    // Exceed SCAN_THRESHOLD (32)
    const deps = Array.from({ length: 40 }, (_, i) => createMockDep(i));
    deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

    // Initial claim triggers Map creation
    expect(buf.claimExisting(deps[39]!, 5)).toBe(true);
    expect(buf.getAt(5)!.node).toBe(deps[39]);

    // Verify subsequent Map-based lookup
    expect(buf.claimExisting(deps[38]!, 6)).toBe(true);
    expect(buf.getAt(6)!.node).toBe(deps[38]);

    // Resetting
    buf.prepareTracking();
    expect(buf.hasComputeds).toBe(false);

    buf.disposeAll();
    expect(buf.size).toBe(0);
  });

  it('should relocate occupants during insertNew', () => {
    const buf = new DepSlotBuffer();
    const linkA = new DependencyLink(createMockDep(1), 1, vi.fn());
    const linkB = new DependencyLink(createMockDep(2), 1, vi.fn());
    const linkNew = new DependencyLink(createMockDep(3), 1, vi.fn());

    buf.add(linkA);
    buf.add(linkB);

    // Insert at 0, should push A to overflow (index 4)
    buf.insertNew(0, linkNew);
    expect(buf.getAt(0)).toBe(linkNew);
    expect(buf.getAt(4)).toBe(linkA);
    expect(buf.size).toBe(3);
  });

  it('should enforce safety structural constraints', () => {
    const buf = new DepSlotBuffer();
    const link = new DependencyLink(createMockDep(1), 1, vi.fn());
    buf.add(link);

    // Prohibit manual remove
    expect(() => buf.remove(link)).toThrow(/prohibited/);

    // No-op compact
    expect(() => buf.compact()).not.toThrow();
  });
});

// ── Regression Tests ───────────────────────────────────────────────────

describe('Regressions', () => {
  it('correctly tracks active count with sparse setAt', () => {
    const buf = new SlotBuffer<string>();
    buf.setAt(10, 'a');
    expect(buf.size).toBe(1); // Should only count the non-null item

    buf.setAt(10, null);
    expect(buf.size).toBe(0);
  });

  it('maintains internal Map synchronization in DepSlotBuffer', () => {
    const buf = new DepSlotBuffer();
    const deps = Array.from({ length: 40 }, (_, i) => createMockDep(i));
    deps.forEach((d) => buf.add(new DependencyLink(d, 1, vi.fn())));

    // Trigger map creation via scan threshold
    buf.claimExisting(deps[39]!, 0);

    // insertNew at index 5 should update map for the NEW link
    const newDep = createMockDep(100);
    const newLink = new DependencyLink(newDep, 1, vi.fn());
    buf.insertNew(5, newLink);

    // If map is synced, claimExisting(newDep) should work even beyond threshold
    expect(buf.claimExisting(newDep, 5)).toBe(true);
    expect(buf.getAt(5)).toBe(newLink);
  });
});
