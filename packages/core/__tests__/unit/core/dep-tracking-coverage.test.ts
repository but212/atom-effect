/**
 * @fileoverview dep-tracking.ts branch coverage tests
 */

import { describe, expect, it, vi } from 'vitest';
import { type Subscription, trackDependency } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';

describe('trackDependency - branch coverage', () => {
  it('deduplicates same function listener, adds different ones', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const subscribers: Subscription<number>[] = [];
    const dep = {} as Dependency;

    trackDependency(dep, fn1, subscribers);
    expect(subscribers.length).toBe(1);

    // Duplicate: should not add again
    trackDependency(dep, fn1, subscribers);
    expect(subscribers.length).toBe(1);

    // Different function: should add
    trackDependency(dep, fn2, subscribers);
    expect(subscribers.length).toBe(2);
  });

  it('deduplicates same Subscriber object, adds different ones', () => {
    const sub1: Subscriber = { execute: vi.fn() };
    const sub2: Subscriber = { execute: vi.fn() };
    const subscribers: Subscription<number>[] = [];
    const dep = {} as Dependency;

    trackDependency(dep, sub1, subscribers);
    expect(subscribers.length).toBe(1);

    // Duplicate: should not add again
    trackDependency(dep, sub1, subscribers);
    expect(subscribers.length).toBe(1);

    // Different subscriber: should add
    trackDependency(dep, sub2, subscribers);
    expect(subscribers.length).toBe(2);
  });

  it('routes DependencySubscriber through addDependency path', () => {
    const addDependency = vi.fn();
    const tracker = { addDependency };
    const subscribers: Subscription<number>[] = [];
    const dep = {} as Dependency;

    trackDependency(dep, tracker, subscribers);

    expect(addDependency).toHaveBeenCalledWith(dep);
    expect(subscribers.length).toBe(0);
  });
});
