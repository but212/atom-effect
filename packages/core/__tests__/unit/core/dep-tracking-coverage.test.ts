/**
 * @fileoverview dep-tracking.ts branch coverage tests
 */

import { describe, expect, it, vi } from 'vitest';
import { SubscriberLink, trackDependency } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';

describe('trackDependency - branch coverage', () => {
  it('returns early when duplicate raw function listener is detected', () => {
    const fn = vi.fn();
    const subscribers: SubscriberLink<number>[] = [];
    const dep = {} as Dependency;

    // First call: adds the function listener
    trackDependency(dep, fn, subscribers);
    expect(subscribers.length).toBe(1);
    expect(subscribers[0]!.fn).toBe(fn);

    // Second call with same function: should early return (lines 19-20)
    trackDependency(dep, fn, subscribers);
    expect(subscribers.length).toBe(1);
  });

  it('returns early when duplicate Subscriber object is detected', () => {
    const sub: Subscriber = { execute: vi.fn() };
    const subscribers: SubscriberLink<number>[] = [];
    const dep = {} as Dependency;

    // First call: adds the subscriber
    trackDependency(dep, sub, subscribers);
    expect(subscribers.length).toBe(1);
    expect(subscribers[0]!.sub).toBe(sub);

    // Second call with same subscriber: should early return (lines 33-34)
    trackDependency(dep, sub, subscribers);
    expect(subscribers.length).toBe(1);
  });

  it('adds different function listeners separately', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const subscribers: SubscriberLink<number>[] = [];
    const dep = {} as Dependency;

    trackDependency(dep, fn1, subscribers);
    trackDependency(dep, fn2, subscribers);
    expect(subscribers.length).toBe(2);
  });

  it('adds different Subscriber objects separately', () => {
    const sub1: Subscriber = { execute: vi.fn() };
    const sub2: Subscriber = { execute: vi.fn() };
    const subscribers: SubscriberLink<number>[] = [];
    const dep = {} as Dependency;

    trackDependency(dep, sub1, subscribers);
    trackDependency(dep, sub2, subscribers);
    expect(subscribers.length).toBe(2);
  });

  it('routes DependencySubscriber through addDependency path', () => {
    const addDependency = vi.fn();
    const tracker = { addDependency };
    const subscribers: SubscriberLink<number>[] = [];
    const dep = {} as Dependency;

    trackDependency(dep, tracker, subscribers);

    expect(addDependency).toHaveBeenCalledWith(dep);
    expect(subscribers.length).toBe(0);
  });
});
