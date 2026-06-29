/**
 * @fileoverview Consolidated error handling and propagation tests
 */

import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it, vi } from 'vitest';
import { aeNextTick, atom, computed, effect } from '@/index';

describe('Core - Error Handling and Propagation', () => {
  describe('Sync Error Propagation & Recovery', () => {
    it('aggregates multiple upstream errors, wraps as ComputedError, and clears completely upon recovery', () => {
      const cause1 = atom(true, { sync: true });
      const cause2 = atom(true, { sync: true });

      const computedX = computed(
        () => {
          if (cause1.value) throw new Error('X fail');
          return 1;
        },
        { defaultValue: 0 }
      );
      const computedY = computed(
        () => {
          if (cause2.value) throw new Error('Y fail');
          return 2;
        },
        { defaultValue: 0 }
      );

      const computedZ = computed(() => computedX.value + computedY.value, { defaultValue: -1 });

      expect(computedZ.hasError).toBe(false);
      expect(computedZ.errors).toEqual([]);

      try {
        computedX.value;
      } catch {
        /* expected */
      }
      try {
        computedY.value;
      } catch {
        /* expected */
      }

      expect(computedZ.value).toBe(0); // 0 + 0
      expect(computedZ.hasError).toBe(true);
      expect(computedZ.errors.length).toBeGreaterThanOrEqual(2);
      expect(computedZ.errors.some((error) => error.message.includes('X fail'))).toBe(true);
      expect(computedZ.errors.some((error) => error.message.includes('Y fail'))).toBe(true);
      expect(Object.isFrozen(computedZ.errors)).toBe(true);

      // Partial recovery: x clears, y still fails
      cause1.value = false;
      expect(computedZ.value).toBe(1); // 1 + 0
      expect(computedZ.hasError).toBe(true);
      expect(computedZ.errors.length).toBe(1);

      // Full recovery
      cause2.value = false;
      expect(computedZ.value).toBe(3); // 1 + 2
      expect(computedZ.hasError).toBe(false);
      expect(computedZ.lastError).toBeNull();
      expect(computedZ.errors).toEqual([]);
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
      user.value; // retry
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
      const someAtom = atom(0);
      const goodWorker = vi.fn();
      const errHandler = vi.fn();

      someAtom.subscribe(() => {
        throw new Error('Subscriber crash');
      });
      someAtom.subscribe(goodWorker);

      const effectInstance = effect(
        () => {
          if (someAtom.value > 0) throw new Error('Effect crash');
        },
        { onError: errHandler }
      );

      await aeNextTick();

      someAtom.value = 1;
      await aeNextTick();

      expect(goodWorker).toHaveBeenCalledTimes(1);
      expect(errHandler).toHaveBeenCalledTimes(1);
      expect(errHandler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(consoleSpy).toHaveBeenCalled();

      expect(effectInstance.isDisposed).toBe(false);
      effectInstance.dispose();
      expect(effectInstance.isDisposed).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
