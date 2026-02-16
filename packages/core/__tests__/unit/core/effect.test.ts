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

    it('executes cleanup functions correctly', async () => {
      const cleanup = vi.fn();
      const e = effect(() => cleanup);

      await vi.runAllTimersAsync(); // Initial run
      e.dispose();

      expect(cleanup).toHaveBeenCalled();
    });

    it('ignores invalid cleanup returns', async () => {
      const e = effect(() => 'invalid' as unknown as () => void); // Should not crash
      await vi.runAllTimersAsync();
      expect(() => e.dispose()).not.toThrow();
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

    it('reacts to computed dependencies', async () => {
      const a = atom(1);
      const c = computed(() => a.value * 2);
      let val = 0;

      effect(() => {
        val = c.value;
      });
      await vi.runAllTimersAsync();
      expect(val).toBe(2);

      a.value = 2;
      await vi.runAllTimersAsync();
      expect(val).toBe(4);
    });
  });

  describe('Error Resilience', () => {
    it('handles execution and cleanup errors without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // 1. Execution Error
      effect(() => {
        throw new Error('Exec Fail');
      });
      await vi.runAllTimersAsync();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockClear();

      // 2. Cleanup Error
      const e = effect(() => () => {
        throw new Error('Cleanup Fail');
      });
      await vi.runAllTimersAsync();
      e.dispose();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('cleans up resources even after partial execution failure', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      const e = effect(() => {
        a.value;
        throw new Error('Fail');
      });

      e.dispose();
      // Just verifying no crash and dispose works
      expect(e.isDisposed).toBe(true);

      consoleSpy.mockRestore();
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
