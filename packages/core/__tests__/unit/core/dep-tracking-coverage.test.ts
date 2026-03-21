/**
 * @fileoverview dep-tracking.ts branch coverage tests
 */

import { describe, expect, it, vi } from 'vitest';
import { DependencyLink, Subscription } from '@/core/dep-tracking';
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
