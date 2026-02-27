/**
 * @fileoverview dep-tracking.ts branch coverage tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DependencyLink, Subscription, syncDependencies } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';

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
