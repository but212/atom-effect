/**
 * @fileoverview Effect Behavior Tests
 * @description Verifies validation, lifecycle, dependency tracking, error handling, and safety limits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { EffectError } from '@/errors/errors';
import { EFFECT_BRAND } from '@/symbols';
import { sleep } from '../../utils/test-helpers';

describe('Effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Identity, Validation & Initialization', () => {
    it('sets brand, rejects invalid inputs, and maintains correct initial state', async () => {
      // Validation
      expect(() => effect(null as unknown as () => void)).toThrow(EffectError);
      expect(() => effect('invalid' as unknown as () => void)).toThrow(EffectError);

      // Identity & State
      const e = effect(() => {});
      expect((e as unknown as Record<symbol, boolean>)[EFFECT_BRAND]).toBe(true);
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
      }); // reads computed which reads atom

      await vi.runAllTimersAsync();
      expect(log).toEqual([0]);
      expect(e.executionCount).toBe(1);

      // Untracked change -> no re-execution
      untracked.value = 99;
      await vi.runAllTimersAsync();
      expect(log).toEqual([0]);

      // Tracked Object.is equal change -> no re-execution
      src.value = 0;
      await vi.runAllTimersAsync();
      expect(e.executionCount).toBe(1);

      // Actual structural change -> re-execution
      src.value = 5;
      await vi.runAllTimersAsync();
      expect(log).toEqual([0, 10]);
      expect(e.executionCount).toBe(2);

      e.dispose();
    });

    it('run() forces an immediate synchronous re-execution bypassing normal scheduling', async () => {
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

    it('isExecuting correctly flags active execution periods', async () => {
      const a = atom(0);
      let capturedExecuting = false;
      let ref: ReturnType<typeof effect> | null = null;

      const e = effect(() => {
        a.value;
        if (ref) capturedExecuting = ref.isExecuting;
      });
      ref = e;

      await vi.runAllTimersAsync(); // init run
      a.value = 1;
      await vi.runAllTimersAsync(); // re-eval

      expect(capturedExecuting).toBe(true);
      expect(e.isExecuting).toBe(false);

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
      e[Symbol.dispose](); // Idempotent

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

      await sleep(2); // Mid-execution
      source.value = 1; // Trigger new run overriding the old one
      await sleep(30);
      e.dispose();

      expect(staleCleanup).toHaveBeenCalled(); // Stale cleanup runs but isn't kept
      expect(freshCleanup).toHaveBeenCalled();
    });
  });

  describe('Error Resilience & Safeguards', () => {
    it('localizes runtime & cleanup errors without crashing framework flows', async () => {
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

      expect(consoleSpy).toHaveBeenCalled(); // Caught internally
      expect(onError).toHaveBeenCalledWith(expect.any(EffectError));

      // Still safely disposable despite throwing errors constantly
      expect(() => e.dispose()).not.toThrow();
      expect(e.isDisposed).toBe(true);
    });

    it('auto-disposes to prevent infinite loops based on frequency constraints', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const a = atom(0);
      const e = effect(
        () => {
          if (a.value > 0) a.value++; // Infinite loop pingpong
        },
        { sync: true, maxExecutionsPerFlush: 3 }
      );

      a.value = 1;
      await sleep(30);

      expect(e.isDisposed).toBe(true); // Terminated circuit breaker
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
    });
  });
});
