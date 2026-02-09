/**
 * @fileoverview Computed-specific tests (coverage supplement)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError, ComputedError } from '@/errors/errors';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Computed', () => {
  describe('Input Validation', () => {
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
  });

  describe('Async Computation', () => {
    it('throws error when accessing pending value without defaultValue', () => {
      const c = computed(async () => {
        await sleep(100);
        return 42;
      });

      expect(() => c.value).toThrow(ComputedError);
    });

    it('transitions through async states and calls onError on rejection', async () => {
      const onError = vi.fn();

      const c = computed(
        async () => {
          await sleep(10);
          throw new Error('Async error');
        },
        { defaultValue: 0, onError }
      );

      // Pending state
      expect(c.value).toBe(0);
      expect(c.isPending).toBe(true);
      expect(c.isResolved).toBe(false);

      await sleep(30);

      // Rejected state
      expect(c.isPending).toBe(false);
      expect(c.hasError).toBe(true);
      expect(c.state).toBe('rejected');
      expect(c.lastError).toBeInstanceOf(Error);
      expect(onError).toHaveBeenCalled();

      // Recoverable defaultValue fallback
      expect(c.value).toBe(0);
    });

    it('resolves async state correctly on success', async () => {
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

    it('settles on latest value when triggered multiple times', async () => {
      const trigger = atom(0);

      const c = computed(
        async () => {
          await sleep(5);
          return trigger.value * 10;
        },
        { defaultValue: 0 }
      );

      c.value;

      trigger.value = 1;
      trigger.value = 2;

      await sleep(100);

      expect(c.value).toBe(20);
    });

    // Regression Test for Bug #23
    it('recomputes when dirty even if in pending state', async () => {
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

      c.value;
      expect(computeCount).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('is safe when onError callback throws', async () => {
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

    it('continues notifying other subscribers when one throws', async () => {
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
      await waitForScheduler();

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Caching & Laziness', () => {
    it('invalidate() triggers recomputation', async () => {
      const computeFn = vi.fn(() => Math.random());
      const c = computed(computeFn);

      const first = c.value;
      expect(computeFn).toHaveBeenCalledTimes(1);

      const second = c.value;
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);

      c.invalidate();
      await waitForScheduler();

      c.value;
      expect(computeFn).toHaveBeenCalledTimes(2);
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

    it('does not recompute without subscribers (lazy)', async () => {
      let computeCount = 0;
      const count = atom(0);

      const c = computed(() => {
        computeCount++;
        return count.value * 2;
      });

      c.value;
      expect(computeCount).toBe(1);

      count.value = 1;
      await waitForScheduler();

      expect(computeCount).toBe(1);

      c.value;
      expect(computeCount).toBe(2);
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
  });

  describe('Lifecycle', () => {
    it('dependencies are cleaned up on dispose', async () => {
      const count = atom(0);
      const c = computed(() => count.value * 2);
      const listener = vi.fn();

      c.subscribe(listener);
      c.value;

      count.value = 1;
      await waitForScheduler();

      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      c.dispose();

      count.value = 2;
      await waitForScheduler();

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
