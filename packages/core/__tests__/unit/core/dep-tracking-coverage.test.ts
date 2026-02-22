/**
 * @fileoverview dep-tracking.ts branch coverage tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DependencyLink,
  Subscription,
  syncDependencies,
  trackDependency,
} from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDep(overrides: Partial<Dependency> = {}): Dependency {
  return {
    id: Math.random(),
    version: 0,
    flags: 0,
    _lastSeenEpoch: -1,
    subscribe: vi.fn(() => vi.fn()),
    ...overrides,
  } as unknown as Dependency;
}

function makeTracker(): Subscriber {
  return { execute: vi.fn() };
}

// ── trackDependency ───────────────────────────────────────────────────────────

describe('trackDependency', () => {
  it('adds and deduplicates function listeners', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const subs: Subscription<number>[] = [];

    trackDependency(makeDep(), fn1, subs);
    trackDependency(makeDep(), fn1, subs); // Duplicate, should be ignored
    trackDependency(makeDep(), fn2, subs);

    expect(subs).toHaveLength(2);
    expect(subs[0]!.fn).toBe(fn1);
    expect(subs[1]!.fn).toBe(fn2);
    expect(subs[0]!.sub).toBeUndefined();
  });

  it('adds and deduplicates Subscriber objects', () => {
    const sub1: Subscriber = { execute: vi.fn() };
    const sub2: Subscriber = { execute: vi.fn() };
    const subs: Subscription<number>[] = [];

    trackDependency(makeDep(), sub1 as unknown as Parameters<typeof trackDependency>[1], subs);
    trackDependency(makeDep(), sub1 as unknown as Parameters<typeof trackDependency>[1], subs); // Duplicate
    trackDependency(makeDep(), sub2 as unknown as Parameters<typeof trackDependency>[1], subs);

    expect(subs).toHaveLength(2);
    expect(subs[0]!.sub).toBe(sub1);
    expect(subs[1]!.sub).toBe(sub2);
    expect(subs[0]!.fn).toBeUndefined();
  });

  it('delegates to addDependency if available (DependencySubscriber path)', () => {
    const addDependency = vi.fn();
    // Prioritizes addDependency even if execute exists
    const tracker = { addDependency, execute: vi.fn() };
    const subs: Subscription<number>[] = [];
    const dep = makeDep();

    trackDependency(dep, tracker, subs);

    expect(addDependency).toHaveBeenCalledWith(dep);
    expect(subs).toHaveLength(0); // Subs array is untouched in this path
  });
});

// ── syncDependencies ──────────────────────────────────────────────────────────

describe('syncDependencies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('efficiently subscribes to new, reuses retained, and unsubscribes from removed links', () => {
    const unsubRetained = vi.fn();
    const unsubRemoved = vi.fn();

    const depRetained = makeDep({ subscribe: vi.fn(() => unsubRetained) });
    const depRemoved = makeDep({ subscribe: vi.fn(() => unsubRemoved) });
    const depNew = makeDep();

    const tracker = makeTracker();

    // 1. Initial State: Retained and Removed
    const prevRetained = new DependencyLink(depRetained, 0);
    const prevRemoved = new DependencyLink(depRemoved, 0);
    syncDependencies([prevRetained, prevRemoved], [], tracker);

    expect(depRetained.subscribe).toHaveBeenCalledTimes(1);
    expect(depRemoved.subscribe).toHaveBeenCalledTimes(1);

    // 2. Next State: Retained is kept, Removed is gone, New is added
    const nextRetained = new DependencyLink(depRetained, 1);
    const nextNew = new DependencyLink(depNew, 0);

    syncDependencies([nextRetained, nextNew], [prevRetained, prevRemoved], tracker);

    // Assertions
    expect(depRetained.subscribe).toHaveBeenCalledTimes(1); // Not called again (reused)
    expect(nextRetained.unsub).toBe(unsubRetained); // Unsub function ported over
    expect(unsubRetained).not.toHaveBeenCalled();

    expect(unsubRemoved).toHaveBeenCalledTimes(1); // Removed dep gets unsubscribed

    expect(depNew.subscribe).toHaveBeenCalledWith(tracker); // New dep gets subscribed
  });

  it('handles edge cases safely (empty arrays, nullish links)', () => {
    const tracker = makeTracker();

    // Empty to empty
    expect(() => syncDependencies([], [], tracker)).not.toThrow();

    // Nullish prevLinks
    const dep = makeDep();
    const link = new DependencyLink(dep, 0);
    expect(() =>
      syncDependencies([link], [null as unknown as DependencyLink], tracker)
    ).not.toThrow();
  });

  it('interacts correctly with debug.checkCircular', () => {
    const checkCircular = vi.spyOn(debug, 'checkCircular').mockImplementation(() => {});
    const dep = makeDep();
    const tracker = makeTracker();
    const link1 = new DependencyLink(dep, 0);

    // Resolves new dependency -> calls debugger
    syncDependencies([link1], [], tracker);
    expect(checkCircular).toHaveBeenCalledTimes(1);
    expect(checkCircular).toHaveBeenCalledWith(dep, tracker);

    checkCircular.mockClear();

    // Reclaims parked dependency -> bypasses debugger
    const link2 = new DependencyLink(dep, 1);
    syncDependencies([link2], [link1], tracker);
    expect(checkCircular).not.toHaveBeenCalled();
  });
});

// ── Models (DependencyLink & Subscription) ───────────────────────────────────

describe('Data Models', () => {
  it('DependencyLink correctly structures identity and mutates limits safely', () => {
    const dep = makeDep();
    const link = new DependencyLink(dep, 42);
    expect(link.node).toBe(dep);
    expect(link.version).toBe(42);
    expect(link.unsub).toBeUndefined();

    const unsub = vi.fn();
    const linkWithUnsub = new DependencyLink(dep, 0, unsub);
    expect(linkWithUnsub.unsub).toBe(unsub);

    link.node = makeDep();
    link.version = 99;
    expect(link.version).toBe(99);
  });

  it('Subscription correctly accepts optional fields', () => {
    const fn = vi.fn();
    const sub: Subscriber = { execute: vi.fn() };

    const s1 = new Subscription(fn, undefined);
    expect(s1.fn).toBe(fn);
    expect(s1.sub).toBeUndefined();

    const s2 = new Subscription(undefined, sub);
    expect(s2.fn).toBeUndefined();
    expect(s2.sub).toBe(sub);

    const s3 = new Subscription(fn, sub);
    expect(s3.fn).toBe(fn);
    expect(s3.sub).toBe(sub);
  });
});
