/**
 * @fileoverview dep-tracking.ts branch coverage tests
 */

import { describe, expect, it, vi } from 'vitest';
import { atom, computed } from '@/core';
import { DependencyLink, Subscription, untracked } from '@/core/tracking';
import type { Dependency, Subscriber } from '@/types';
import { flush } from '../../utils/test-helpers';

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

describe('untracked()', () => {
  it('suppresses dependency tracking inside computed', () => {
    const a = atom(0);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return untracked(() => a.value);
    });

    expect(c.value).toBe(0);
    expect(computeCount).toBe(1);

    a.value = 1;
    expect(c.value).toBe(0); // not recomputed
    expect(computeCount).toBe(1);
  });

  it('passes return value through and propagates errors', () => {
    expect(untracked(() => 42)).toBe(42);
    expect(() =>
      untracked(() => {
        throw new Error('Ops');
      })
    ).toThrow('Ops');
  });

  it('computed with mixed tracked and untracked deps only reacts to tracked', async () => {
    const a = atom(1);
    const b = atom(10);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return a.value + untracked(() => b.value);
    });

    expect(c.value).toBe(11);
    expect(computeCount).toBe(1);

    b.value = 20; // untracked — c must not recompute
    await flush();
    expect(c.value).toBe(11);
    expect(computeCount).toBe(1);

    a.value = 2; // tracked — c recomputes and picks up latest b
    await flush();
    expect(c.value).toBe(22); // 2 + 20
    expect(computeCount).toBe(2);
  });
});
