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

  describe('Validation & Initialization', () => {
    it('rejects invalid constructor inputs', () => {
      expect(() => effect(null as unknown as () => void)).toThrow(EffectError);
      expect(() => effect('invalid' as unknown as () => void)).toThrow(EffectError);
    });

    it('maintains correct initial state and lifecycle flags', async () => {
      const e = effect(() => {});
      expect(e.isDisposed).toBe(false);
      expect(e.executionCount).toBe(1);

      e.dispose();
      expect(e.isDisposed).toBe(true);
      expect(() => e.run()).toThrow(EffectError);
    });
  });

  describe('Reactivity & Dependency Tracking', () => {
    it('tracks deep dependencies and re-executes only on actual changes', async () => {
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

      untracked.value = 99; // No trigger
      await vi.runAllTimersAsync();
      expect(log).toEqual([0]);

      src.value = 0; // No value change
      await vi.runAllTimersAsync();
      expect(e.executionCount).toBe(1);

      src.value = 5; // Trigger
      await vi.runAllTimersAsync();
      expect(log).toEqual([0, 10]);
      expect(e.executionCount).toBe(2);

      e.dispose();
    });

    it('handles various dependency scenarios (Computed, Overflows, Dirty Checks)', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 1. Computed Dirty Check Resilience & Pulling
      const a = atom(0);
      let computeCount = 0;
      const c = computed(() => {
        computeCount++;
        if (a.value === -1) throw new Error('computed throw');
        return a.value;
      });
      const e = effect(() => {
        void c.value;
      });
      expect(computeCount).toBe(1);

      a.value = -1; // Force computed error during dirty check
      await vi.runAllTimersAsync();
      expect(consoleWarnSpy).toHaveBeenCalled();

      // 2. Slot Overflow (index >= 4)
      const atoms = Array.from({ length: 6 }, (_, i) => atom(i));
      const e2 = effect(() => {
        atoms.forEach((a) => void a.value);
      });
      await vi.runAllTimersAsync();

      atoms[5]!.value = 100;
      await vi.runAllTimersAsync();
      expect(e2.executionCount).toBe(2);

      e.dispose();
      e2.dispose();
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
    });
  });

  describe('Lifecycle & Cleanup', () => {
    it('manages cleanup sequence and prevents dependency leakage', async () => {
      const trigger = atom(0, { sync: true });
      const leakage = atom(0);
      const order: string[] = [];

      const e = effect(
        () => {
          trigger.value;
          order.push('run');
          return () => {
            void leakage.value; // Should not be tracked as a dependency
            order.push('cleanup');
          };
        },
        { sync: true }
      );

      trigger.value = 1;
      leakage.value = 1; // Should not trigger re-run due to leakage protection

      e.dispose();
      expect(order).toEqual(['run', 'cleanup', 'run', 'cleanup']);
      expect(e.isDisposed).toBe(true);
    });

    it('handles async cleanups and race conditions (stale results)', async () => {
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
      source.value = 1; // Supersedes first run
      await sleep(30);

      expect(staleCleanup).toHaveBeenCalled(); // Superseded run's cleanup executed immediately
      expect(freshCleanup).not.toHaveBeenCalled(); // Current cleanup not yet triggered

      e.dispose();
      expect(freshCleanup).toHaveBeenCalled();
    });

    it('severs reactivity and handles invalid cleanups gracefully', async () => {
      const src = atom(0);
      let runs = 0;
      const e = effect(() => {
        src.value;
        runs++;
        return 'invalid' as unknown as () => void;
      });
      await vi.runAllTimersAsync();

      e.dispose();
      src.value = 1;
      await vi.runAllTimersAsync();
      expect(runs).toBe(1); // No re-run after disposal
    });
  });

  describe('Safety & Error Resilience', () => {
    it('isolates execution errors and propagates via onError', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn();
      const a = atom(0);

      const e = effect(
        () => {
          if (a.value === 1) throw new Error('Crashed');
        },
        { onError }
      );

      a.value = 1;
      await vi.runAllTimersAsync();

      expect(onError).toHaveBeenCalledWith(expect.any(EffectError));
      expect(consoleSpy).toHaveBeenCalled();
      expect(e.isDisposed).toBe(false); // Should stay active by default unless explicit dispose
      e.dispose();
    });

    it('prevents infinite loops and frequency abuse', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      // 1. Automatic loop prevention
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

      // 2. Manual run bypass (Resetting counter)
      const e2 = effect(() => {}, { maxExecutionsPerFlush: 5 });
      expect(() => {
        for (let i = 0; i < 10; i++) e2.run();
      }).not.toThrow();

      e2.dispose();
    });

    it('gracefully handles async failures (executions & cleanups)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.useRealTimers();

      // Async execution rejection
      let rejectAsync!: (val: unknown) => void;
      effect(() => new Promise((_, r) => (rejectAsync = r)));
      rejectAsync(new Error('Reject'));

      // Async cleanup rejection
      let resolveAsync!: (val: () => void) => void;
      const e = effect(() => new Promise<() => void>((r) => (resolveAsync = r)));
      e.dispose();
      resolveAsync(() => {
        throw new Error('Cleanup Fail');
      });

      await sleep(10);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
    });

    it('handles side-effect subscription failures', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badDep = atom(0);
      vi.spyOn(badDep, 'subscribe').mockImplementation(() => {
        throw new Error('subscribe fail');
      });

      const e = effect(() => {
        void badDep.value;
      });

      await vi.runAllTimersAsync();
      expect(consoleError).toHaveBeenCalled();
      e.dispose();
    });
  });
});
