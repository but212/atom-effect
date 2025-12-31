/**
 * @fileoverview Computed-specific tests (coverage supplement)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { ComputedError } from '@/errors/errors';

describe('Computed - Error Handling and Edge Cases', () => {
  it('rejects invalid function types', () => {
    expect(() => {
      computed('not a function' as any);
    }).toThrow(ComputedError);

    expect(() => {
      computed(null as any);
    }).toThrow(ComputedError);
  });

  it('rejects invalid subscriber types', () => {
    const c = computed(() => 1);

    expect(() => {
      c.subscribe('not a function' as any);
    }).toThrow(ComputedError);
  });

  it('throws error when accessing value in pending state without defaultValue', () => {
    const c = computed(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
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

    await new Promise((resolve) => setTimeout(resolve, 20));

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
    await new Promise((resolve) => setTimeout(resolve, 10));

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
    await new Promise((resolve) => setTimeout(resolve, 20));

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

  it('ignores initial computation failure when lazy=false', () => {
    const shouldFail = atom(true);

    // lazy=false but initial computation failure is ignored
    const c = computed(
      () => {
        if (shouldFail.value) throw new Error('Init error');
        return 42;
      },
      { lazy: false }
    );

    // Should not throw error (ignored by try-catch)
    expect(c).toBeDefined();
  });

  it('handles errors during subscriber execution', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    c.subscribe(() => {
      throw new Error('Subscriber error');
    });

    c.value; // Initial computation
    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));

    consoleError.mockRestore();
  });

  it('is safe even when async computation is triggered multiple times', async () => {
    const trigger = atom(0);

    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return trigger.value * 10;
      },
      { defaultValue: 0 }
    );

    c.value; // Trigger initial computation

    trigger.value = 1;
    trigger.value = 2;

    // Wait long enough for all async computations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

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
    await new Promise((resolve) => setTimeout(resolve, 10));

    const _third = c.value; // Recomputed
    expect(computeFn).toHaveBeenCalledTimes(2);
  });

  it('does not notify subscribers after dispose', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const listener = vi.fn();

    c.subscribe(listener);
    c.value; // Initial computation

    c.dispose();

    count.value = 10;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // No notification to subscribers after dispose
    expect(listener).not.toHaveBeenCalled();
  });

  it('throws error for invalid dependencies', () => {
    const badAtom = {
      get value() {
        throw new Error('Access failed');
      },
      subscribe: () => () => {},
    };

    const c = computed(() => (badAtom as any).value);

    expect(() => c.value).toThrow();
  });

  it('computed chain works correctly', async () => {
    const count = atom(0);
    const doubled = computed(() => count.value * 2);
    const quadrupled = computed(() => doubled.value * 2);

    expect(quadrupled.value).toBe(0);

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(quadrupled.value).toBe(20);
  });

  it('subscriber error does not affect other subscribers', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const errorListener = vi.fn(() => {
      throw new Error('Subscriber error');
    });
    const normalListener = vi.fn();

    c.subscribe(errorListener);
    c.subscribe(normalListener);

    c.value;
    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorListener).toHaveBeenCalled();
    expect(normalListener).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('dependencies are cleaned up on dispose', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const listener = vi.fn();

    c.subscribe(listener);
    c.value; // Register dependencies

    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    c.dispose();

    count.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).not.toHaveBeenCalled();
  });

  describe('Additional Edge Cases', () => {
    it('onError callback is called', async () => {
      const errorHandler = vi.fn();

      const c = computed(
        () => {
          throw new Error('Computation error');
        },
        { onError: errorHandler }
      );

      expect(() => c.value).toThrow();
      expect(errorHandler).toHaveBeenCalled();
    });

    it('is safe even when error occurs in onError callback', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const c = computed(
        () => {
          throw new Error('Computation error');
        },
        {
          onError: () => {
            throw new Error('Error in error handler');
          },
        }
      );

      expect(() => c.value).toThrow('Computation error');
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('async computed onError is called', async () => {
      const errorHandler = vi.fn();

      const c = computed(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Async error');
        },
        { defaultValue: 0, onError: errorHandler }
      );

      expect(c.value).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorHandler).toHaveBeenCalled();
      expect(c.hasError).toBe(true);
    });

    it('invalidate() forces recomputation', async () => {
      let computeCount = 0;
      const count = atom(0);

      const c = computed(() => {
        computeCount++;
        return count.value * 2;
      });

      c.value; // First computation
      expect(computeCount).toBe(1);

      c.value; // Use cache
      expect(computeCount).toBe(1);

      c.invalidate(); // Force invalidation
      c.value; // Recompute
      expect(computeCount).toBe(2);
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

      // Should already be computed before value access
      expect(isComputed).toBe(true);
      expect(c.value).toBe(42);
    });

    it('ignores initial error when lazy=false', () => {
      const c = computed(
        () => {
          throw new Error('Initial error');
        },
        { lazy: false }
      );

      // Initial error is ignored, recomputes on value access
      expect(() => c.value).toThrow('Initial error');
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

      // Change atom without subscribers
      count.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // No recomputation without subscribers (lazy)
      expect(computeCount).toBe(1);

      // Recompute on value access
      c.value;
      expect(computeCount).toBe(2);
    });

    it('async state properties are accurate', async () => {
      const c = computed(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return 42;
        },
        { defaultValue: 0 }
      );

      // Start computation with value access
      expect(c.value).toBe(0); // defaultValue
      expect(c.isPending).toBe(true);
      expect(c.isResolved).toBe(false);
      expect(c.hasError).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // After completion: resolved
      expect(c.isPending).toBe(false);
      expect(c.isResolved).toBe(true);
      expect(c.hasError).toBe(false);
      expect(c.value).toBe(42);
    });

    it('peek() does not trigger recomputation', () => {
      let computeCount = 0;
      const count = atom(0);

      const c = computed(() => {
        computeCount++;
        return count.value * 2;
      });

      c.value; // First computation
      expect(computeCount).toBe(1);

      count.value = 1;

      // peek does not check dirty
      const peeked = c.peek();
      expect(peeked).toBe(0); // Previous value
      expect(computeCount).toBe(1); // No recomputation
    });

    it('state property works correctly', () => {
      const c = computed(() => 42);

      expect(c.state).toBe('idle');

      c.value; // Start computation

      expect(c.state).toBe('resolved');
      expect(c.value).toBe(42);
    });
  });
});
