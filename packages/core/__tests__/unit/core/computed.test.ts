/**
 * @fileoverview Computed Behavior Tests
 * @description Verifies validation, async flows, caching strategies, and lifecycle management.
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError, ComputedError } from '@/errors/errors';
import { debug } from '@/utils/debug';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Computed', () => {
  describe('Validation & Error Safety', () => {
    it('rejects invalid inputs', () => {
      expect(() => computed(null as unknown as () => void)).toThrow(ComputedError);
      const c = computed(() => 1);
      expect(() => c.subscribe('invalid' as unknown as () => void)).toThrow(AtomError);
    });

    it('handles internal errors gracefully', () => {
      // 1. Function execution error
      const c = computed(() => {
        throw new Error('Fn Error');
      });

      // Should wrap error
      expect(() => c.value).toThrow(ComputedError);
      expect(c.hasError).toBe(true);

      // 2. Internal tracking error (simulated via debug spy)
      const a = atom(1);
      const spy = vi.spyOn(debug, 'checkCircular').mockImplementation(() => {
        throw new Error('Internal Error');
      });
      const c2 = computed(() => a.value);

      // Should catch internal error and transition to error state
      expect(() => c2.value).toThrow(ComputedError);
      expect(c2.hasError).toBe(true);

      spy.mockRestore();
    });
  });

  describe('Async Workflow', () => {
    it('manages pending, resolved, and rejected states', async () => {
      // 1. Pending Access Check (no default)
      const c1 = computed(async () => {
        await sleep(50);
        return 1;
      });
      expect(() => c1.value).toThrow(ComputedError);
      expect(c1.isPending).toBe(true);

      // 2. Success Transition
      const c2 = computed(
        async () => {
          await sleep(10);
          return 42;
        },
        { defaultValue: 0 }
      );
      expect(c2.value).toBe(0); // Initial default
      await sleep(20);
      expect(c2.value).toBe(42);
      expect(c2.isResolved).toBe(true);

      // 3. Error Fallback
      // If onError is not guaranteed to be called when defaultValue is present (implementation detail),
      // we focus on the value fallback behavior which is the contract.
      const c3 = computed(
        async () => {
          await sleep(10);
          throw new Error('Fail');
        },
        { defaultValue: -1 }
      );
      await sleep(20);

      // Value should be fallback
      expect(c3.value).toBe(-1);
    });

    it('resolves race conditions by ignoring stale promises', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          const v = trigger.value;
          // Case 0: slow (50ms), Case 1: fast (10ms)
          await sleep(v === 0 ? 50 : 10);
          return v;
        },
        { defaultValue: -1 }
      );

      c.value; // Start Run 0

      trigger.value = 1; // Start Run 1 (invalidates partial Run 0)
      await sleep(5); // Ensure Run 1 starts
      c.value;

      await sleep(60); // Wait for all timing

      // Run 1 finishes at T+15-20. Run 0 finishes at T+50.
      // Result should be 1 (Run 0 should be ignored).
      expect(c.value).toBe(1);
    });
  });

  describe('Caching Strategy', () => {
    it('caches values and supports manual invalidation', async () => {
      const fn = vi.fn(() => Math.random());
      const c = computed(fn);

      const v1 = c.value;
      const v2 = c.value;
      expect(v1).toBe(v2);
      expect(fn).toHaveBeenCalledTimes(1);

      c.invalidate();
      await waitForScheduler();

      const v3 = c.value;
      expect(v3).not.toBe(v1);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('recomputes only when necessary (Lazy & Peek)', async () => {
      const src = atom(0);
      const fn = vi.fn(() => src.value);
      const c = computed(fn);

      // Lazy: No computation until pull
      expect(fn).not.toHaveBeenCalled();

      c.value;
      expect(fn).toHaveBeenCalledTimes(1);

      src.value = 1;
      await waitForScheduler();

      // Still 1 (lazy invalidation, no pull yet)
      expect(fn).toHaveBeenCalledTimes(1);

      // Peek returns current cached value (stale or not? usually stale if dirty but not recomputed)
      // Based on previous tests: peek() returns 0 (stale) without recompute.
      expect(c.peek()).toBe(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Pull triggers update
      expect(c.value).toBe(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Lifecycle', () => {
    it('cleans up dependencies on dispose', async () => {
      const a = atom(0);
      const spy = vi.fn();
      const c = computed(() => a.value);
      c.subscribe(spy);

      c.value; // Link
      a.value = 1;
      await waitForScheduler();
      expect(spy).toHaveBeenCalled(); // Active

      spy.mockClear();
      c.dispose();

      a.value = 2;
      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled(); // Inactive
    });
  });
});
