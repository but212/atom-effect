/**
 * @fileoverview Computed Behavior Tests
 * @description Refined test suite focusing on core behaviors: Lazy evaluation, Caching, and Error Handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomError, aeNextTick, atom, ComputedError, computed, effect, isComputed } from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Computed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Validation & Identity', () => {
    it('initializes correctly and rejects invalid arguments', () => {
      const c = computed(() => 1);
      expect(isComputed(c)).toBe(true);
      expect(c).toBeDefined();

      // Invalid arguments validation
      expect(() => computed(null as unknown as () => void)).toThrow(ComputedError);
      expect(() => c.subscribe(null as unknown as () => void)).toThrow(AtomError);
    });
  });

  describe('Laziness & Caching', () => {
    it('evaluates only when accessed and caches stable results', async () => {
      const src = atom(1);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn);

      // Lazy: not called on creation
      expect(fn).not.toHaveBeenCalled();

      // First evaluation
      expect(c.value).toBe(2);
      expect(fn).toHaveBeenCalledTimes(1);

      // Cached: subsequent reads do not trigger compute function
      c.value;
      c.value;
      expect(fn).toHaveBeenCalledTimes(1);

      // Recompute: only after dependency change and subsequent re-access
      src.value = 5;
      await aeNextTick();
      expect(fn).toHaveBeenCalledTimes(1); // Still cached until explicitly read
      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('respects equality checks to skip unnecessary recomputations', async () => {
      const src = atom({ x: 1 });
      const fn = vi.fn(() => ({ x: src.value.x }));
      const c = computed(fn, {
        equal: (a, b) => a.x === b.x,
      });

      c.value; // initialize
      const spy = vi.fn();
      effect(() => {
        c.value;
        spy();
      });
      spy.mockClear(); // Clear initial run

      src.value = { x: 1 }; // Structurally different, but logically identical
      await aeNextTick();

      expect(c.value).toEqual({ x: 1 });
      expect(fn).toHaveBeenCalledTimes(2); // Initial + Re-evaluation
      expect(spy).not.toHaveBeenCalled(); // Effect skipped re-run because c.version didn't change
    });
  });

  describe('Error Handling', () => {
    it('catches and exposes computation errors without crashing', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const c = computed(
        () => {
          throw new Error('boom');
        },
        {
          onError: () => {
            throw new Error('handler error');
          }, // Should be caught internally
        }
      );

      expect(() => c.value).toThrow(ComputedError);
      expect(c.hasError).toBe(true);
      expect(c.lastError?.message).toContain('boom');
      expect(consoleError).toHaveBeenCalled(); // Internal handler error was caught
    });
  });

  describe('Async Flow', () => {
    it('manages state transitions and default values during resolution', async () => {
      const c = computed(
        async () => {
          await sleep(20);
          return 'done';
        },
        { defaultValue: 'loading' }
      );

      expect(c.value).toBe('loading');
      expect(c.isPending).toBe(true);

      await sleep(30);
      expect(c.value).toBe('done');
      expect(c.isResolved).toBe(true);
    });

    it('resolves race conditions by preferring the latest request', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          const v = trigger.value;
          await sleep(v === 0 ? 50 : 10); // First request is intentionally slower
          return v;
        },
        { defaultValue: -1 }
      );

      c.value; // Request 0 (50ms)
      trigger.value = 1;
      await sleep(5);
      c.value; // Request 1 (10ms) - Overwrites the previous one

      await sleep(60);
      expect(c.value).toBe(1); // The latest request (v=1) wins
    });

    it('throws ComputedError if accessed during pending/error without defaultValue', async () => {
      const p = computed(async () => {
        await sleep(10);
        return 1;
      });
      // Throws because the state is still pending and no default value is provided
      expect(() => p.value).toThrow(ComputedError);

      const e = computed(() => {
        throw new Error('fail');
      });
      expect(() => e.value).toThrow(ComputedError);
    });
  });

  describe('Lifecycle & Reactivity', () => {
    it('maintains a clean reactive chain and disposes correctly', async () => {
      const a = atom(1);
      const b = computed(() => a.value + 1);
      const c = computed(() => b.value * 2);

      expect(c.value).toBe(4);

      const spy = vi.fn();
      const unsub = c.subscribe(spy);
      expect(c.subscriberCount()).toBe(1);

      a.value = 5;
      await aeNextTick();
      expect(spy).toHaveBeenCalled();
      expect(c.value).toBe(12);

      c.dispose();
      expect(() => c.value).toThrow(ComputedError);
      expect(c.subscriberCount()).toBe(0);
      unsub();
    });

    it('prevents dependency leakage when checking meta-states', () => {
      const dep = atom(0);
      const child = computed(() => dep.value);
      const parent = computed(() => child.hasError);

      // Tracker subscribes only to parent.hasError
      const spy = vi.fn();
      const tracker = computed(() => parent.hasError);
      tracker.subscribe(spy);
      tracker.value;

      dep.value = 1; // child state changes, but parent.hasError remains 'false'
      expect(spy).not.toHaveBeenCalled(); // No unnecessary notification should occur
    });
  });
});
