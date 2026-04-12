/**
 * @fileoverview Refactored tracking tests: Focusing on behavior and core safety.
 */

import { describe, expect, it, vi } from 'vitest';
import { atom, computed } from '@/core';
import {
  type DependencySubscriber,
  Subscription,
  trackingContext,
  untracked,
} from '@/core/tracking';
import type { Subscriber } from '@/types';
import { flush } from '../../utils/test-helpers';

describe('Tracking Context & untracked()', () => {
  it('untracked() suppresses dependency collection while allowing value access', async () => {
    const a = atom(1);
    const b = atom(10);
    let computeCount = 0;

    // Mixed mode: a is tracked, b is untracked
    const c = computed(() => {
      computeCount++;
      return a.value + untracked(() => b.value);
    });

    expect(c.value).toBe(11);

    // 1. Untracked change: must NOT trigger re-computation
    b.value = 20;
    await flush();
    expect(c.value).toBe(11); // Stale value is expected until 'a' changes
    expect(computeCount).toBe(1);

    // 2. Tracked change: must trigger re-computation and pick up latest untracked value
    a.value = 2;
    await flush();
    expect(c.value).toBe(22); // 2 + 20
    expect(computeCount).toBe(2);

    // 3. Simple passthrough & error propagation
    expect(untracked(() => 'foo')).toBe('foo');
    expect(() =>
      untracked(() => {
        throw new Error('baz');
      })
    ).toThrow('baz');
  });

  it('LIMITATION: tracking context is strictly synchronous for safety', async () => {
    const a = atom(0);
    const sub = {
      execute: vi.fn(),
      addDependency: vi.fn(),
    } as unknown as Subscriber & DependencySubscriber;

    await trackingContext.run(sub, async () => {
      a.value; // Synchronous: Tracked
      await Promise.resolve();
      a.value; // Asynchronous: NOT tracked (intended limitation)
    });

    expect(sub.addDependency).toHaveBeenCalledTimes(1);
  });
});

describe('Subscription Notification Robustness', () => {
  it('Subscription.notify ensures reliable execution and context isolation', () => {
    const fn = vi.fn();
    const sub = {
      execute: vi.fn(),
      addDependency: vi.fn(),
    } as unknown as Subscriber & DependencySubscriber;

    const s = new Subscription(fn, sub);

    // Context Isolation: running notify inside another tracker must not leak
    trackingContext.run(sub, () => {
      s.notify(1, 0);
    });

    // 1. Reliable execution: both callback and subscriber are called
    expect(fn).toHaveBeenCalledWith(1, 0);
    expect(sub.execute).toHaveBeenCalled();

    // 2. Context Safety: notify must be untracked internally
    expect(sub.addDependency).not.toHaveBeenCalled();
  });
});
