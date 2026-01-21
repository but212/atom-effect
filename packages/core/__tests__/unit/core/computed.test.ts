/**
 * @fileoverview Computed-specific tests (coverage supplement)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError, ComputedError } from '@/errors/errors';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Computed - Error Handling and Edge Cases', () => {
  it('rejects invalid function types', () => {
    expect(() => {
      computed('not a function' as unknown as () => void);
    }).toThrow(ComputedError);

    expect(() => {
      computed(null as unknown as () => void);
    }).toThrow(ComputedError);
  });

  it('rejects invalid subscriber types', () => {
    const c = computed(() => 1);

    expect(() => {
      c.subscribe('not a function' as unknown as (newValue?: number, oldValue?: number) => void);
    }).toThrow(AtomError);
  });

  it('throws error when accessing value in pending state without defaultValue', () => {
    const c = computed(async () => {
      await sleep(100);
      return 42;
    });

    // Access without defaultValue in pending state
    expect(() => c.value).toThrow(ComputedError);
  });

  it('handles rejected state during async computation', async () => {
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Async error');
      },
      { defaultValue: 0 }
    );

    // Initial defaultValue
    expect(c.value).toBe(0);
    expect(c.isPending).toBe(true);

    await sleep(20);

    expect(c.hasError).toBe(true);
    expect(c.state).toBe('rejected');
    expect(c.lastError).toBeInstanceOf(Error);
  });

  it('returns recoverable defaultValue in rejected state', async () => {
    const c = computed(
      async () => {
        throw new Error('Test error');
      },
      { defaultValue: 999 }
    );

    c.value; // Trigger computation
    await sleep(10);

    // When recoverable=true and defaultValue exists, return defaultValue instead of error
    expect(c.value).toBe(999);
  });

  it('handles async onError callback errors', async () => {
    const onError = vi.fn();
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Async error');
      },
      { defaultValue: 0, onError }
    );

    c.value; // Trigger computation
    await sleep(20);

    expect(onError).toHaveBeenCalled();
  });

  it('is safe even when onError callback throws an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const c = computed(
      () => {
        throw new Error('Compute error');
      },
      {
        onError: () => {
          throw new Error('Callback error');
        },
      }
    );

    expect(() => c.value).toThrow();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('behaves like peek() during recomputing', () => {
    const count = atom(0);
    let _recomputeValue = 0;

    const c = computed(() => {
      _recomputeValue = c.peek(); // Self-reference during recomputing
      return count.value * 2;
    });

    c.value; // Initial computation
    // Recomputing flag check prevents infinite recursion
  });

  it('handles errors during subscriber execution', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const errorListener = vi.fn(() => {
      throw new Error('Subscriber error');
    });
    const normalListener = vi.fn();

    c.subscribe(errorListener);
    c.subscribe(normalListener);

    c.value; // Initial computation
    count.value = 1;
    await waitForScheduler();

    expect(errorListener).toHaveBeenCalled();
    expect(normalListener).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('is safe even when async computation is triggered multiple times', async () => {
    const trigger = atom(0);

    const c = computed(
      async () => {
        await sleep(5);
        return trigger.value * 10;
      },

      { defaultValue: 0 }
    );

    c.value; // Trigger initial computation

    trigger.value = 1;
    trigger.value = 2;

    // Wait long enough for all async computations to complete
    await sleep(100);

    // Final value should be reflected
    expect(c.value).toBe(20);
  });

  it('invalidate() triggers recomputation', async () => {
    const computeFn = vi.fn(() => Math.random());
    const c = computed(computeFn);

    const first = c.value;
    expect(computeFn).toHaveBeenCalledTimes(1);

    const second = c.value; // Cached
    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    c.invalidate();
    await waitForScheduler();

    const _third = c.value; // Recomputed
    expect(computeFn).toHaveBeenCalledTimes(2);
  });

  it('throws error for invalid dependencies', () => {
    const badAtom = {
      get value() {
        throw new Error('Access failed');
      },
      subscribe: () => () => {},
    };

    const c = computed(() => (badAtom as unknown as { value: unknown }).value);

    expect(() => c.value).toThrow();
  });

  it('dependencies are cleaned up on dispose', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const listener = vi.fn();

    c.subscribe(listener);
    c.value; // Register dependencies

    count.value = 1;
    await waitForScheduler();

    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    c.dispose();

    count.value = 2;
    await waitForScheduler();

    expect(listener).not.toHaveBeenCalled();
  });
  it('computes immediately when lazy=false', () => {
    let isComputed = false;

    const c = computed(
      () => {
        isComputed = true;
        return 42;
      },
      { lazy: false }
    );

    expect(isComputed).toBe(true);
    expect(c.value).toBe(42);
  });

  it('does not recompute without subscribers', async () => {
    let computeCount = 0;
    const count = atom(0);

    const c = computed(() => {
      computeCount++;
      return count.value * 2;
    });

    c.value; // First computation
    expect(computeCount).toBe(1);

    count.value = 1;
    await waitForScheduler();

    expect(computeCount).toBe(1); // No recomputation without subscribers (lazy)

    c.value; // Recompute on value access
    expect(computeCount).toBe(2);
  });

  it('async state properties are accurate', async () => {
    const c = computed(
      async () => {
        await sleep(20);
        return 42;
      },
      { defaultValue: 0 }
    );

    expect(c.value).toBe(0);
    expect(c.isPending).toBe(true);

    await sleep(50);

    expect(c.isPending).toBe(false);
    expect(c.isResolved).toBe(true);
    expect(c.value).toBe(42);
  });

  it('peek() does not trigger recomputation', () => {
    let computeCount = 0;
    const count = atom(0);

    const c = computed(() => {
      computeCount++;
      return count.value * 2;
    });

    c.value;
    expect(computeCount).toBe(1);

    count.value = 1;
    expect(c.peek()).toBe(0);
    expect(computeCount).toBe(1);
  });

  // Regression Test for Bug #23
  it('recomputes when dirty even if in pending/rejected state', async () => {
    const dep = atom(0);
    let computeCount = 0;

    const c = computed(
      async () => {
        computeCount++;
        const val = dep.value;
        await sleep(10);
        if (val < 0) throw new Error('Negative');
        return val;
      },
      { defaultValue: -1 }
    );

    c.value;
    expect(c.isPending).toBe(true);
    expect(computeCount).toBe(1);

    dep.value = 1;
    await sleep(0);

    const _val = c.value;
    expect(computeCount).toBe(2);
  });
});
