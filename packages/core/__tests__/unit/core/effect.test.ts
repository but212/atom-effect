/**
 * @fileoverview Effect Behavior Tests
 * @description Verifies validation, lifecycle, dependency tracking, error handling, and safety limits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom, computed, EffectError, effect } from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Validation & Initialization', () => {
    it('rejects invalid constructor inputs', () => {
      expect(() => effect(null as unknown as () => void)).toThrow(EffectError);
      expect(() => effect('invalid' as unknown as () => void)).toThrow(EffectError);
    });

    it('maintains correct initial state', async () => {
      const e = effect(() => {});
      expect(e.isDisposed).toBe(false);

      await vi.runAllTimersAsync();
      expect(e.isExecuting).toBe(false);
      expect(e.executionCount).toBe(1);

      e.dispose();
    });
  });

  describe('Reactivity & Dependency Tracking', () => {
    it('tracks deep dependencies (atoms/computeds) and re-executes on actual changes', async () => {
      const src = atom(0);
      const untracked = atom(0);
      const doubled = computed(() => src.value * 2);

      const log: number[] = [];
      const e = effect(() => {
        log.push(doubled.value);
      });

      await vi.runAllTimersAsync();
      expect(log).toEqual([0]);
      expect(e.executionCount).toBe(1);

      untracked.value = 99;
      await vi.runAllTimersAsync();
      expect(log).toEqual([0]);

      src.value = 0;
      await vi.runAllTimersAsync();
      expect(e.executionCount).toBe(1);

      src.value = 5;
      await vi.runAllTimersAsync();
      expect(log).toEqual([0, 10]);
      expect(e.executionCount).toBe(2);

      e.dispose();
    });

    it('run() forces an immediate synchronous re-execution', async () => {
      let count = 0;
      const e = effect(() => {
        count++;
      });
      await vi.runAllTimersAsync();

      e.run();
      expect(count).toBe(2);

      e.dispose();
      expect(() => e.run()).toThrow(EffectError);
    });

    it('isExecuting flags active execution periods', async () => {
      const a = atom(0);
      let capturedExecuting = false;
      let ref: ReturnType<typeof effect> | null = null;

      const e = effect(() => {
        a.value;
        if (ref) capturedExecuting = ref.isExecuting;
      });
      ref = e;

      await vi.runAllTimersAsync();
      a.value = 1;
      await vi.runAllTimersAsync();

      expect(capturedExecuting).toBe(true);
      expect(e.isExecuting).toBe(false);

      e.dispose();
    });

    it('handles errors when checking if computed dependencies are dirty', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = atom(0);
      let throwInComputed = false;
      const c = computed(() => {
        if (throwInComputed) throw new Error('computed throw');
        return a.value;
      });

      let runs = 0;
      const e = effect(() => {
        c.value;
        runs++;
      });
      await vi.runAllTimersAsync();

      throwInComputed = true;
      a.value = 1;
      await vi.runAllTimersAsync();

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(runs).toBe(1);
      e.dispose();
    });

    it('should remain reactive after the effect function throws before accessing any dependency', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      let shouldThrow = false;
      let runs = 0;

      const e = effect(
        () => {
          if (shouldThrow) throw new Error('boom before deps');
          a.value;
          runs++;
        },
        { onError: () => {} }
      );

      await vi.runAllTimersAsync();
      expect(runs).toBe(1);

      shouldThrow = true;
      a.value = 1;
      await vi.runAllTimersAsync();

      shouldThrow = false;
      a.value = 2;
      await vi.runAllTimersAsync();

      expect(runs).toBe(2);
      e.dispose();
      consoleSpy.mockRestore();
    });

    it('should preserve unvisited dependencies when the function throws mid-tracking', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const b = atom(0);
      let shouldThrow = false;
      let runs = 0;

      const e = effect(
        () => {
          a.value;
          if (shouldThrow) throw new Error('boom mid-tracking');
          b.value;
          runs++;
        },
        { onError: () => {} }
      );

      await vi.runAllTimersAsync();
      expect(runs).toBe(1);

      shouldThrow = true;
      a.value = 1;
      await vi.runAllTimersAsync();

      shouldThrow = false;

      b.value = 99;
      await vi.runAllTimersAsync();

      expect(runs).toBe(2);
      e.dispose();
      consoleSpy.mockRestore();
    });

    it('should not truncate dependencies on the error path to preserve existing subscription counts', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const b = atom(0);
      const c = atom(0);
      let throwOnRun = false;
      const capturedValues: number[] = [];

      const e = effect(
        () => {
          if (throwOnRun) throw new Error('kaboom');
          capturedValues.push(a.value + b.value + c.value);
        },
        { onError: () => {} }
      );

      await vi.runAllTimersAsync();
      expect(capturedValues).toEqual([0]);

      const aSubsBefore = a.subscriberCount();
      const bSubsBefore = b.subscriberCount();
      const cSubsBefore = c.subscriberCount();

      expect(aSubsBefore).toBeGreaterThanOrEqual(1);
      expect(bSubsBefore).toBeGreaterThanOrEqual(1);
      expect(cSubsBefore).toBeGreaterThanOrEqual(1);

      throwOnRun = true;
      a.value = 1;
      await vi.runAllTimersAsync();

      expect(a.subscriberCount()).toBe(aSubsBefore);
      expect(b.subscriberCount()).toBe(bSubsBefore);
      expect(c.subscriberCount()).toBe(cSubsBefore);

      e.dispose();
      consoleSpy.mockRestore();
    });

    it('should handle cases where the dependency buffer is disposed mid-execution gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      let eB: ReturnType<typeof effect> | null = null;

      const eA = effect(
        () => {
          a.value;
          if (eB && !eB.isDisposed) eB.dispose();
        },
        { sync: true }
      );

      eB = effect(
        () => {
          a.value;
        },
        { sync: true }
      );

      expect(() => {
        a.value = 1;
      }).not.toThrow();

      await vi.runAllTimersAsync();
      expect(eB.isDisposed).toBe(true);

      eA.dispose();
      consoleSpy.mockRestore();
    });
  });

  describe('Lifecycle & Cleanup', () => {
    it('orchestrates cleanup properly on re-runs and final disposal idempotently', async () => {
      const src = atom(0, { sync: true });
      const order: string[] = [];

      const e = effect(
        () => {
          src.value;
          order.push('run');
          return () => order.push('cleanup');
        },
        { sync: true }
      );

      src.value = 1;
      await vi.runAllTimersAsync();

      e.dispose();

      expect(order).toEqual(['run', 'cleanup', 'run', 'cleanup']);
      expect(e.isDisposed).toBe(true);
    });

    it('gracefully handles missing or invalid cleanup returns', async () => {
      const e = effect(() => 'invalid' as unknown as () => void);
      await vi.runAllTimersAsync();
      expect(() => e.dispose()).not.toThrow();
    });

    it('severs reactivity after disposal', async () => {
      const src = atom(0);
      let runs = 0;
      const e = effect(() => {
        src.value;
        runs++;
      });
      await vi.runAllTimersAsync();

      e.dispose();
      src.value = 1;
      await vi.runAllTimersAsync();
      expect(runs).toBe(1);
    });

    it('should not corrupt dependency tracking when cleanup errors occur during execution', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      let cleanupShouldThrow = true;
      let runs = 0;

      const e = effect(
        () => {
          a.value;
          runs++;
          return () => {
            if (cleanupShouldThrow) {
              cleanupShouldThrow = false;
              throw new Error('cleanup boom');
            }
          };
        },
        { onError: () => {} }
      );

      await vi.runAllTimersAsync();
      expect(runs).toBe(1);

      a.value = 1;
      await vi.runAllTimersAsync();
      expect(runs).toBe(2);

      a.value = 2;
      await vi.runAllTimersAsync();
      expect(runs).toBe(3);

      e.dispose();
      consoleSpy.mockRestore();
    });
  });

  describe('Async Lifecycle Patterns', () => {
    it('executes async cleanups and ignores stale cleanups when superseded', async () => {
      vi.useRealTimers();
      const source = atom(0);
      const staleCleanup = vi.fn();
      const freshCleanup = vi.fn();

      const e = effect(async () => {
        const val = source.value;
        await sleep(10);
        return val === 0 ? staleCleanup : freshCleanup;
      });

      await sleep(2);
      source.value = 1;
      await sleep(30);
      e.dispose();

      expect(staleCleanup).toHaveBeenCalled();
      expect(freshCleanup).toHaveBeenCalled();
    });

    it('ensures async consistency by resolving results in the first microtask cycle', async () => {
      vi.useRealTimers();
      let resolvePromise!: (v: () => void) => void;
      const promise = new Promise<() => void>((r) => {
        resolvePromise = r;
      });

      const cleanup = vi.fn();
      const e = effect(() => promise);

      await sleep(10);
      resolvePromise(cleanup);

      await Promise.resolve();

      e.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should ignore async promise rejections after effect re-execution (stale session)', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      let firstReject!: (err: Error) => void;
      let secondResolve!: (val: undefined) => void;
      let runIdx = 0;

      const e = effect(() => {
        a.value;
        runIdx++;
        if (runIdx === 1) {
          return new Promise((_r, rej) => {
            firstReject = rej;
          });
        }
        return new Promise((r) => {
          secondResolve = r;
        });
      });

      await sleep(5);

      a.value = 1;
      await sleep(5);

      firstReject(new Error('stale rejection'));
      await sleep(10);

      expect(consoleSpy).not.toHaveBeenCalled();

      secondResolve(undefined);
      e.dispose();
      consoleSpy.mockRestore();
    });
  });

  describe('Error Resilience & Safeguards', () => {
    it('localizes execution errors & triggers onError without crashing flows', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn(() => {
        throw new Error('onError fail');
      });

      const a = atom(0);
      const e = effect(
        () => {
          a.value;
          throw new Error('Exec Fail');
        },
        { onError }
      );

      await vi.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.any(EffectError));
      expect(() => e.dispose()).not.toThrow();
      expect(e.isDisposed).toBe(true);
    });

    it('auto-disposes to prevent infinite loops based on frequency constraints', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      const e = effect(
        () => {
          if (a.value > 0) a.value++;
        },
        { sync: true, maxExecutionsPerFlush: 3 }
      );

      a.value = 1;
      await sleep(30);

      expect(e.isDisposed).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
    });

    it('handles errors in synchronous cleanups and maintains reactivity', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      let runCount = 0;

      const e = effect(() => {
        a.value;
        runCount++;
        return () => {
          throw new Error('sync cleanup error');
        };
      });
      await vi.runAllTimersAsync();
      expect(runCount).toBe(1);

      a.value = 1;
      await vi.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
      expect(runCount).toBe(2);

      a.value = 2;
      await vi.runAllTimersAsync();
      expect(runCount).toBe(3);

      e.dispose();
    });

    it('safely handles errors from async execution', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.useRealTimers();

      let rejectAsync!: (val: unknown) => void;
      effect(() => new Promise((_, r) => (rejectAsync = r)));
      rejectAsync(new Error('async reject'));

      await sleep(10);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
    });

    it('safely handles errors from async cleanups', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.useRealTimers();

      let resolveAsync!: (val: () => void) => void;
      const e = effect(() => new Promise<() => void>((r) => (resolveAsync = r)));
      e.dispose();
      resolveAsync(() => {
        throw new Error('cleanup error');
      });

      await sleep(10);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
    });

    it('should remain reactive on subsequent runs after recovering from an error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      let shouldThrow = false;
      let runs = 0;

      const e = effect(
        () => {
          if (shouldThrow) throw new Error('boom');
          a.value;
          runs++;
        },
        { onError: () => {} }
      );

      await vi.runAllTimersAsync();
      expect(runs).toBe(1);

      shouldThrow = true;
      a.value = 1;
      await vi.runAllTimersAsync();

      shouldThrow = false;
      e.run();
      expect(runs).toBe(2);

      a.value = 2;
      await vi.runAllTimersAsync();

      expect(runs).toBe(3);
      e.dispose();
      consoleSpy.mockRestore();
    });

    it('should provide a clear error when run() is called after budget is exceeded, rather than double faulting', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      const e = effect(
        () => {
          if (a.value > 0) a.value++;
        },
        { sync: true, maxExecutionsPerFlush: 2 }
      );

      a.value = 1;
      await sleep(30);

      expect(e.isDisposed).toBe(true);

      expect(() => e.run()).toThrow(EffectError);

      consoleSpy.mockRestore();
    });
  });

  describe('Coverage Gaps & Edge Cases', () => {
    it('handles dependency slot overflows (index >= 4)', async () => {
      const atoms = Array.from({ length: 6 }, (_, i) => atom(i));
      const e = effect(() => {
        for (const a of atoms) {
          a.value;
        }
      });
      await vi.runAllTimersAsync();
      expect(e.executionCount).toBe(1);

      const a5 = atoms[5];
      if (!a5) throw new Error('Setup failed');
      a5.value = 100;
      await vi.runAllTimersAsync();
      expect(e.executionCount).toBe(2);
      e.dispose();
    });

    it('handles errors when a dependency subscription fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn();
      const badDep = atom(0);
      vi.spyOn(badDep, 'subscribe').mockImplementation(() => {
        throw new Error('subscribe fail');
      });

      const e = effect(
        () => {
          badDep.value;
        },
        { onError }
      );

      await vi.runAllTimersAsync();
      expect(consoleError).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
      e.dispose();
    });
  });
});
