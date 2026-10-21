import { describe, expect, it, vi } from 'vitest';
import { BUFFER_FLAGS } from '@/core/buffers';
import { ReactiveTracker } from '@/core/tracker';
import { atom, computed } from '@/index';
import type { Dependency } from '@/types';

class TestTracker extends ReactiveTracker {
  addDependency(dependency: Dependency): void {
    this.trackDependency(dependency, () => {});
  }
}

describe('ReactiveTracker (tracker.ts)', () => {
  it('initializes with default tracking state and SMI id', () => {
    const tracker = new TestTracker();

    expect(tracker.id).toBeDefined();
    expect(typeof tracker.id).toBe('number');
    expect(tracker.flags).toBe(0);
    expect(tracker._depFlags).toBe(BUFFER_FLAGS.NONE);
    expect(tracker._trackEpoch).toBe(0);
    expect(tracker._trackCount).toBe(0);
    expect(tracker._depSlots.size).toBe(0);
  });

  it('advances tracking epoch and resets trackCount on startTracking()', () => {
    const tracker = new TestTracker();
    tracker._trackCount = 5;

    const epoch1 = tracker.startTracking();
    expect(tracker._trackCount).toBe(0);
    expect(tracker._trackEpoch).toBe(epoch1);

    const epoch2 = tracker.startTracking();
    expect(epoch2).toBeGreaterThanOrEqual(epoch1);
    expect(tracker._trackCount).toBe(0);
  });

  it('tracks dependencies and skips redundant registrations in the same epoch', () => {
    const tracker = new TestTracker();
    const sourceAtom = atom(10);
    const notifyCb = vi.fn();

    tracker.startTracking();
    tracker.trackDependency(sourceAtom as unknown as Dependency, notifyCb);
    expect(tracker._trackCount).toBe(1);
    expect(tracker._depSlots.size).toBe(1);

    // Redundant track within same epoch should be ignored
    tracker.trackDependency(sourceAtom as unknown as Dependency, notifyCb);
    expect(tracker._trackCount).toBe(1);
    expect(tracker._depSlots.size).toBe(1);
  });

  it('sets HAS_COMPUTEDS flag when tracking computed dependencies', () => {
    const tracker = new TestTracker();
    const sourceAtom = atom(1);
    const derived = computed(() => sourceAtom.value * 2);

    tracker.startTracking();
    expect(tracker._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS).toBe(0);

    tracker.trackDependency(derived as unknown as Dependency, () => {});
    expect((tracker._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) !== 0).toBe(true);
  });

  it('truncates unvisited dependencies on commitDeps()', () => {
    const tracker = new TestTracker();
    const atomA = atom('a');
    const atomB = atom('b');

    // First session: track both atomA and atomB
    tracker.startTracking();
    tracker.trackDependency(atomA as unknown as Dependency, () => {});
    tracker.trackDependency(atomB as unknown as Dependency, () => {});
    tracker.commitDeps();
    expect(tracker._depSlots.size).toBe(2);

    // Second session: only track atomA
    tracker.startTracking();
    tracker.trackDependency(atomA as unknown as Dependency, () => {});
    tracker.commitDeps();

    expect(tracker._depSlots.size).toBe(1);
    expect(tracker._depSlots.at(0)?.node).toBe(atomA);
  });

  it('detects dirty dependencies via hasDirtyDeps()', () => {
    const tracker = new TestTracker();
    const sourceAtom = atom('initial');

    tracker.startTracking();
    tracker.trackDependency(sourceAtom as unknown as Dependency, () => {});
    tracker.commitDeps();

    expect(tracker.hasDirtyDeps()).toBe(false);

    sourceAtom.value = 'updated';
    expect(tracker.hasDirtyDeps()).toBe(true);
  });

  it('cleans up all subscriptions and resets flags on disposeDeps()', () => {
    const tracker = new TestTracker();
    const sourceAtom = atom(42);
    const derived = computed(() => sourceAtom.value + 1);

    tracker.startTracking();
    tracker.trackDependency(derived as unknown as Dependency, () => {});
    tracker.commitDeps();
    expect(tracker._depSlots.size).toBe(1);
    expect((tracker._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) !== 0).toBe(true);

    tracker.disposeDeps();
    expect(tracker._depSlots.size).toBe(0);
    expect(tracker._depFlags).toBe(BUFFER_FLAGS.NONE);
  });
});
