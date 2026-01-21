/**
 * @fileoverview Consolidated error handling and propagation tests
 */

import { describe, expect, it, vi } from 'vitest';
import { AsyncState, EMPTY_ERROR_ARRAY } from '@/constants';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Core - Error Handling and Propagation', () => {
  describe('Sync Error Propagation', () => {
    it('propagates errors through a computed chain', () => {
      const source = atom(1, { sync: true });
      const a = computed(
        () => {
          if (source.value === 0) throw new Error('Zero error');
          return source.value;
        },
        { defaultValue: -1 }
      );
      const b = computed(() => a.value * 2, { defaultValue: -1 });

      expect(b.value).toBe(2);

      source.value = 0;
      expect(() => b.value).toThrow('Zero error');
      expect(a.hasError).toBe(true);
      expect(b.hasError).toBe(true);

      expect(b.errors.some((e) => e.message.includes('Zero error'))).toBe(true);

      source.value = 2;
      expect(b.value).toBe(4);
      expect(b.hasError).toBe(false);
    });

    it('accumulates errors from multiple sources', () => {
      const x = computed(
        () => {
          throw new Error('X fail');
        },
        { defaultValue: 0 }
      );
      const y = computed(
        () => {
          throw new Error('Y fail');
        },
        { defaultValue: 0 }
      );

      expect(() => x.value).toThrow();
      expect(() => y.value).toThrow();

      const z = computed(() => x.value + y.value, { defaultValue: -1 });
      expect(z.value).toBe(0); // Recovered via defaultValues
      expect(z.hasError).toBe(true);
      expect(z.errors.some((e) => e.message.includes('X fail'))).toBe(true);
      expect(z.errors.some((e) => e.message.includes('Y fail'))).toBe(true);
    });
  });

  describe('Async Error Propagation', () => {
    it('propagates async errors to downstream observers', async () => {
      const user = computed(
        async () => {
          await sleep(10);
          throw new Error('API Fail');
        },
        { defaultValue: null }
      );

      const profile = computed(
        async () => {
          if (!user.value) return null;
          return { name: 'Test' };
        },
        { defaultValue: null }
      );

      profile.value; // Trigger
      await sleep(30);

      expect(user.state).toBe(AsyncState.REJECTED);
      expect(profile.hasError).toBe(true);
      expect(profile.errors[0]?.message).toContain('API Fail');
    });

    it('clears errors on successful recovery', async () => {
      const shouldFail = atom(true);
      const data = computed(
        async () => {
          await sleep(10);
          if (shouldFail.value) throw new Error('Fail');
          return 'Success';
        },
        { defaultValue: 'Loading' }
      );

      data.value;
      await sleep(30);
      expect(data.hasError).toBe(true);

      shouldFail.value = false;
      data.invalidate();
      data.value;
      await sleep(30);
      expect(data.hasError).toBe(false);
      expect(data.value).toBe('Success');
    });
  });

  describe('Edge Cases', () => {
    it('returns EMPTY_ERROR_ARRAY for valid states', () => {
      const c = computed(() => 42);
      expect(c.value).toBe(42);
      expect(c.errors).toBe(EMPTY_ERROR_ARRAY);
    });

    it('handles subscriber errors gracefully', async () => {
      const a = atom(0);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      effect(() => {
        if (a.value > 0) throw new Error('Effect crash');
      });

      await waitForScheduler();
      a.value = 1;
      await waitForScheduler();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
