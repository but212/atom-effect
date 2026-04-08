/**
 * @fileoverview Effect Behavior Tests
 * @description Verifies validation, lifecycle, dependency tracking, error handling, and safety limits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectError } from '@/errors';
import { atom, computed, effect } from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  interface InternalEffect {
    _deps: {
      truncateFrom(index: number): void;
    };
    dispose(): void;
  }

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

    it('pulls computed values during dirty checks within an effect', async () => {
      const src = atom(0);
      let computeCount = 0;
      const c = computed(() => {
        computeCount++;
        return src.value * 2;
      });

      const results: number[] = [];
      const e = effect(() => {
        results.push(c.value);
      });
      expect(computeCount).toBe(1);
      expect(results).toEqual([0]);

      src.value = 5;
      await vi.runAllTimersAsync();
      expect(results).toContain(10);
      expect(computeCount).toBeGreaterThanOrEqual(2);

      e.dispose();
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
      e[Symbol.dispose]();

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

    it('isolates crashing side-effects and wraps errors via onError safely', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const goodWorker = vi.fn();
      const errHandler = vi.fn();

      a.subscribe(() => {
        throw new Error('Subscriber crash');
      });
      a.subscribe(goodWorker);

      const e = effect(
        () => {
          if (a.value > 0) throw new Error('Effect crash');
        },
        { onError: errHandler }
      );

      await vi.runAllTimersAsync();

      a.value = 1;
      await vi.runAllTimersAsync();

      expect(goodWorker).toHaveBeenCalledTimes(1);
      expect(errHandler).toHaveBeenCalledTimes(1);
      expect(errHandler.mock.calls[0]![0]).toBeInstanceOf(Error);
      expect(consoleSpy).toHaveBeenCalled();

      e.dispose();
      consoleSpy.mockRestore();
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

      a.value = 1; // triggers re-execution and cleanup error
      await vi.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
      expect(runCount).toBe(2); // Validates effect remained reactive

      a.value = 2; // trigger again to ensure normal operation
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
      e.dispose(); // disposed before resolve
      resolveAsync(() => {
        throw new Error('cleanup error');
      });

      await sleep(10);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
    });
  });

  describe('Coverage Gaps', () => {
    it('handles dependency slot overflows (index >= 4)', async () => {
      const atoms = Array.from({ length: 6 }, (_, i) => atom(i));
      const e = effect(() => {
        atoms.forEach((a) => a.value);
      });
      await vi.runAllTimersAsync();
      expect(e.executionCount).toBe(1);

      atoms[5]!.value = 100;
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

    it('handles errors in _commitDeps during recovery', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = atom(0);
      const e = effect(() => {
        a.value;
        throw new Error('exec fail');
      }) as unknown as InternalEffect;

      vi.spyOn(e._deps, 'truncateFrom').mockImplementationOnce(() => {
        throw new Error('truncate fail');
      });

      a.value = 1;
      await vi.runAllTimersAsync();
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('_commitDeps failed'),
        expect.anything()
      );
      e.dispose();
    });
  });
});
