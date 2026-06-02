/**
 * @fileoverview Consolidated error handling and propagation tests
 */

import { describe, expect, it, vi } from 'vitest';
import { aeNextTick, atom, computed, effect } from '@/index';
import { sleep } from '../utils/test-helpers';

describe('Core - Error Handling and Propagation', () => {
  describe('Sync Error Propagation & Recovery', () => {
    it('aggregates multiple upstream errors, wraps as ComputedError, and clears completely upon recovery', () => {
      const cause1 = atom(true, { sync: true });
      const cause2 = atom(true, { sync: true });

      const x = computed(
        () => {
          if (cause1.value) throw new Error('X fail');
          return 1;
        },
        { defaultValue: 0 }
      );
      const y = computed(
        () => {
          if (cause2.value) throw new Error('Y fail');
          return 2;
        },
        { defaultValue: 0 }
      );

      const z = computed(() => x.value + y.value, { defaultValue: -1 });

      expect(z.hasError).toBe(false);
      expect(z.errors).toEqual([]);

      // Trigger x and y evaluations — direct access throws even with defaultValue
      try {
        x.value;
      } catch {
        /* expected */
      }
      try {
        y.value;
      } catch {
        /* expected */
      }

      expect(z.value).toBe(0); // 0 + 0
      expect(z.hasError).toBe(true);
      expect(z.errors.length).toBeGreaterThanOrEqual(2);
      expect(z.errors.some((e) => e.message.includes('X fail'))).toBe(true);
      expect(z.errors.some((e) => e.message.includes('Y fail'))).toBe(true);
      expect(Object.isFrozen(z.errors)).toBe(true);

      // Partial recovery: x clears, y still fails
      cause1.value = false;
      expect(z.value).toBe(1); // 1 + 0
      expect(z.hasError).toBe(true);
      expect(z.errors.length).toBe(1);

      // Full recovery
      cause2.value = false;
      expect(z.value).toBe(3); // 1 + 2
      expect(z.hasError).toBe(false);
      expect(z.lastError).toBeNull();
      expect(z.errors).toEqual([]);
    });
  });

  describe('Async Lifecycle Error Propagation', () => {
    it('transitions asynchronously to rejected state and recovers fully upon retry', async () => {
      const shouldFail = atom(true);
      const user = computed(
        async () => {
          await sleep(10);
          if (shouldFail.value) throw new Error('API Fail');
          return { name: 'Test' };
        },
        { defaultValue: null }
      );

      expect(user.state).toBe('idle');
      user.value;
      expect(user.state).toBe('pending');

      await sleep(30);

      expect(user.state).toBe('rejected');
      expect(user.hasError).toBe(true);
      expect(user.errors[0]?.message).toContain('API Fail');

      shouldFail.value = false;
      user.invalidate();
      user.value;

      await sleep(30);

      expect(user.state).toBe('resolved');
      expect(user.hasError).toBe(false);
      expect(user.errors).toEqual([]);
      expect(user.value).toEqual({ name: 'Test' });
    });
  });

  describe('Effect & Subscriber Isolation', () => {
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

      await aeNextTick();

      a.value = 1;
      await aeNextTick();

      expect(goodWorker).toHaveBeenCalledTimes(1);
      expect(errHandler).toHaveBeenCalledTimes(1);
      expect(errHandler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(consoleSpy).toHaveBeenCalled();

      expect(e.isDisposed).toBe(false);
      e.dispose();
      expect(e.isDisposed).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
