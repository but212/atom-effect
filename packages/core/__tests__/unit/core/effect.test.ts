/**
 * @fileoverview Effect Behavior Tests
 * @description Verifies validation, lifecycle, dependency tracking, error handling, and safety limits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { EffectError } from '@/errors/errors';
import { sleep } from '../../utils/test-helpers';

describe('Effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Validation & Safety', () => {
    it('rejects invalid inputs', () => {
      expect(() => effect(null as unknown as () => void)).toThrow(EffectError);
      expect(() => effect('invalid' as unknown as () => void)).toThrow(EffectError);
    });

    it('prevents running disposed effects', () => {
      const e = effect(() => {});
      e.dispose();
      expect(() => e.run()).toThrow(EffectError);
    });
  });

  describe('Lifecycle & Cleanup', () => {
    it('manages manual run and idempotent dispose', () => {
      let runs = 0;
      const e = effect(
        () => {
          runs++;
        },
        { sync: true }
      );

      expect(runs).toBe(1); // Initial run
      e.run();
      expect(runs).toBe(2); // Manual run

      e.dispose();
      e.dispose(); // Idempotent
      expect(e.isDisposed).toBe(true);
    });

    it('executes valid cleanup and ignores invalid cleanup returns', async () => {
      // Valid cleanup
      const cleanup = vi.fn();
      const e1 = effect(() => cleanup);
      await vi.runAllTimersAsync();
      e1.dispose();
      expect(cleanup).toHaveBeenCalled();

      // Invalid cleanup (non-function return) — should not crash
      const e2 = effect(() => 'invalid' as unknown as () => void);
      await vi.runAllTimersAsync();
      expect(() => e2.dispose()).not.toThrow();
    });

    it('prevents re-entrant sync execution cycles', async () => {
      const a = atom(0);
      let runs = 0;

      // This pattern normally causes infinite recursion loops if not guarded
      effect(
        () => {
          runs++;
          a.value; // Track
          if (runs === 1) a.value = 1; // Trigger immediate update
        },
        { sync: true }
      );

      await vi.runAllTimersAsync();
      // It runs initial (1), then triggers update (2).
      // If re-entrancy wasn't handled, it might crash or stack overflow.
      expect(runs).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Dependency Dynamics', () => {
    it('tracks and untracks dependencies dynamically', async () => {
      const switchAtom = atom(true);
      const a = atom('a');
      const b = atom('b');
      let result = '';

      effect(() => {
        result = switchAtom.value ? a.value : b.value;
      });

      await vi.runAllTimersAsync();
      expect(result).toBe('a');

      switchAtom.value = false; // Switch branch
      await vi.runAllTimersAsync();
      expect(result).toBe('b');

      // 'a' should be untracked now
      a.value = 'change';
      await vi.runAllTimersAsync();
      expect(result).toBe('b'); // No update triggered by 'a'
    });
  });

  describe('Error Resilience', () => {
    it('handles execution and cleanup errors without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // 1. Execution error — logs but doesn't throw, dispose still works
      const a = atom(0);
      const e1 = effect(() => {
        a.value;
        throw new Error('Exec Fail');
      });
      await vi.runAllTimersAsync();
      expect(consoleSpy).toHaveBeenCalled();
      e1.dispose();
      expect(e1.isDisposed).toBe(true);
      consoleSpy.mockClear();

      // 2. Cleanup error — logs but doesn't throw
      const e2 = effect(() => () => {
        throw new Error('Cleanup Fail');
      });
      await vi.runAllTimersAsync();
      e2.dispose();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Async Effect Lifecycle', () => {
    it('handles async effect with cleanup', async () => {
      vi.useRealTimers();
      const cleanup = vi.fn();

      const e = effect(async () => {
        await sleep(5);
        return cleanup;
      });

      await sleep(20);
      e.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('runs stale cleanup when newer execution supersedes', async () => {
      vi.useRealTimers();
      const source = atom(0);
      const staleCleanup = vi.fn();
      const freshCleanup = vi.fn();

      const e = effect(async () => {
        const val = source.value;
        await sleep(10);
        return val === 0 ? staleCleanup : freshCleanup;
      });

      // Trigger a second execution before first resolves
      await sleep(2);
      source.value = 1;
      await sleep(30);

      // Stale cleanup should be called immediately (race guard)
      expect(staleCleanup).toHaveBeenCalled();
      e.dispose();
    });

    it('handles async error in rejected promise', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn();

      effect(
        async () => {
          await sleep(5);
          throw new Error('Async boom');
        },
        { onError }
      );

      await sleep(20);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Dirty Check Edge Cases', () => {
    it('skips execution when dependencies have not changed', async () => {
      const source = atom(1);
      let runs = 0;

      effect(() => {
        source.value;
        runs++;
      });

      await vi.runAllTimersAsync();
      expect(runs).toBe(1);

      // Set same value — atom equality check prevents version bump
      source.value = 1;
      await vi.runAllTimersAsync();
      expect(runs).toBe(1); // No re-execution
    });

    it('detects dirty state when computed throws during dirty check', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const trigger = atom(false, { sync: true });
      let runs = 0;

      const c = computed(() => {
        if (trigger.value) throw new Error('Computed fail');
        return 1;
      });

      effect(
        () => {
          try {
            c.value;
          } catch {
            // Expected when computed throws
          }
          runs++;
        },
        { sync: true }
      );

      expect(runs).toBe(1);

      // Now make computed throw — dirty check catches error, marks dirty, effect re-runs
      trigger.value = true;
      await sleep(10);

      expect(runs).toBeGreaterThanOrEqual(2);

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Error Handler Edge Cases', () => {
    it('survives when onError callback itself throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      effect(
        () => {
          throw new Error('Primary error');
        },
        {
          onError: () => {
            throw new Error('Handler error');
          },
        }
      );

      await vi.runAllTimersAsync();

      // Should log execution error + handler error without crashing
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  describe('Observable Properties', () => {
    it('exposes executionCount and isExecuting', async () => {
      const a = atom(0);
      let capturedExecuting = false;
      let effectRef: ReturnType<typeof effect> | null = null;

      const e = effect(() => {
        a.value;
        if (effectRef) capturedExecuting = effectRef.isExecuting;
      });
      effectRef = e;

      await vi.runAllTimersAsync();
      expect(e.executionCount).toBeGreaterThanOrEqual(1);
      expect(e.isExecuting).toBe(false);

      // Trigger re-run so the closure captures isExecuting
      a.value = 1;
      await vi.runAllTimersAsync();

      expect(capturedExecuting).toBe(true);
      expect(e.isExecuting).toBe(false);
      e.dispose();
    });
  });

  describe('Loop Detection & Limits', () => {
    it('detects independent infinite loops and enforces limits', async () => {
      vi.useRealTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      const e = effect(
        () => {
          // Need a condition to start the loop, otherwise it runs on init
          if (a.value > 0) a.value = a.value + 1;
        },
        { sync: true, maxExecutionsPerSecond: 10 }
      );

      a.value = 1; // Start loop
      await sleep(50);

      expect(e.isDisposed).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
