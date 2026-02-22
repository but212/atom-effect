/**
 * @fileoverview Computed Behavior Tests
 * @description Verifies validation, async flows, caching strategies, and lifecycle management.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError, ComputedError } from '@/errors/errors';
import { ATOM_BRAND, COMPUTED_BRAND } from '@/symbols';
import { debug } from '@/utils/debug';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Computed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Identity & Validation', () => {
    it('ensures unique identity, branding, and rejects invalid constructor inputs', () => {
      const c1 = computed(() => 1);
      const c2 = computed(() => 2);

      expect((c1 as unknown as Record<symbol, boolean>)[ATOM_BRAND]).toBe(true);
      expect((c1 as unknown as Record<symbol, boolean>)[COMPUTED_BRAND]).toBe(true);
      expect((c1 as unknown as { id: number }).id).not.toBe((c2 as unknown as { id: number }).id);

      expect(() => computed(null as unknown as () => void)).toThrow(ComputedError);
      expect(() => c1.subscribe('invalid' as unknown as () => void)).toThrow(AtomError);
    });
  });

  describe('Error Safety & Handlers', () => {
    it('safely catches computation errors and exposes full error state', () => {
      const err = new Error('Fn Error');
      const c = computed(() => {
        throw err;
      });

      expect(() => c.value).toThrow(ComputedError);
      expect(c.hasError).toBe(true);
      expect(c.isValid).toBe(false);
      expect(c.lastError).toBeInstanceOf(ComputedError);
      expect(c.errors[0]).toBeInstanceOf(ComputedError);
    });

    it('invokes onError callbacks securely without propagating handler errors', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn(() => {
        throw new Error('handler boom');
      });

      const c = computed(
        () => {
          throw new Error('boom');
        },
        { onError: handler }
      );

      expect(() => c.value).toThrow(ComputedError);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled(); // Caught internally
    });

    it('handles obscure internal tracking errors gracefully', () => {
      const spy = vi.spyOn(debug, 'checkCircular').mockImplementation(() => {
        throw new Error('Internal');
      });
      const c = computed(() => atom(1).value);
      expect(() => c.value).toThrow(ComputedError);
      spy.mockRestore();
    });
  });

  describe('State & Reactivity (Lazy & Caching)', () => {
    it('maintains state transitions: idle -> cached & tracks dep changes exactly', async () => {
      const src = atom(0);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn) as unknown as {
        state: string;
        isPending: boolean;
        value: number;
        version: number;
      };

      // 1. Initial Identity Check
      expect(c.state).toBe('idle');
      expect(c.isPending).toBe(false);
      expect(fn).not.toHaveBeenCalled(); // Lazy evaluation

      // 2. First Access: resolves and caches
      expect(c.value).toBe(0);
      expect(c.state).toBe('resolved');
      expect(fn).toHaveBeenCalledTimes(1);

      c.value;
      c.value;
      expect(fn).toHaveBeenCalledTimes(1); // Cached

      // 3. Dependency update triggers recompute & version bump
      const v0 = c.version;
      src.value = 5;
      await waitForScheduler();
      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(c.version).toBeGreaterThan(v0);

      // 4. Same structural value does NOT recompute
      src.value = 5;
      await waitForScheduler();
      c.value;
      expect(fn).toHaveBeenCalledTimes(2); // Still cached
    });

    it('respects custom equality function without redundant bumping', async () => {
      const src = atom({ x: 1 });
      const c = computed(() => ({ x: src.value.x }), {
        equal: (a, b) => a.x === b.x,
      }) as unknown as { value: { x: number }; version: number };
      c.value;

      const v0 = c.version;
      src.value = { x: 1 };
      await waitForScheduler();
      c.value;
      expect(c.version).toBe(v0);
    });

    it('can be manually invalidated or peeked stalely', async () => {
      const src = atom(0);
      const fn = vi.fn(() => src.value);
      const c = computed(fn);

      c.value;
      c.invalidate();
      await waitForScheduler();
      c.value; // pull triggers recompute after invalidation
      expect(fn).toHaveBeenCalledTimes(2);

      src.value = 99;
      await waitForScheduler();
      expect(c.peek()).toBe(0); // Stale read skips computation
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Chain & Lifecycle Behavior', () => {
    it('propagates transparently through multiple levels and tracks subscribers', async () => {
      const a = atom(1);
      const b = computed(() => a.value + 1);
      const c = computed(() => b.value * 2);

      expect(c.value).toBe(4);
      expect(c.subscriberCount()).toBe(0);

      const spy = vi.fn();
      const unsub = c.subscribe(spy);
      expect(c.subscriberCount()).toBe(1);

      a.value = 4;
      await waitForScheduler();
      expect(c.value).toBe(10);
      expect(spy).toHaveBeenCalledTimes(1);

      unsub();
      expect(c.subscriberCount()).toBe(0);
    });

    it('dispose() cleans up resources exhaustively and denies usage', () => {
      const c = computed(() => 1);
      c.subscribe(() => {});

      c.dispose();
      c[Symbol.dispose](); // Double dispose safety

      expect(() => c.value).toThrow(ComputedError);
      expect(c.subscriberCount()).toBe(0);
    });

    it('re-uses existing dependency links without excessive memory growth', async () => {
      const a = atom(0);
      const c = computed(() => a.value) as unknown as { value: number; _links: unknown[] };
      c.value;
      const linksLen = c._links.length;
      a.value = 1;
      await waitForScheduler();
      c.value;
      expect(c._links.length).toBe(linksLen);
    });
  });

  describe('Async & Eager Scenarios', () => {
    it('eager evaluations compute on-creation and trap errors', () => {
      const fn = vi.fn(() => 42);
      const c1 = computed(fn, { lazy: false });
      expect(c1.value).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);

      const c2 = computed(
        () => {
          throw new Error('eager boom');
        },
        { lazy: false }
      );
      expect(c2.hasError).toBe(true);
    });

    it('flows through idle -> pending -> resolved with safe default wrappers', async () => {
      const c = computed(
        async () => {
          await sleep(20);
          return 42;
        },
        { defaultValue: 0 }
      );

      expect(c.state).toBe('idle');

      expect(c.value).toBe(0); // Uses default while pending
      expect(c.isPending).toBe(true);
      expect(c.state).toBe('pending');

      await sleep(30);
      expect(c.value).toBe(42); // Resolved properly
      expect(c.isResolved).toBe(true);
      expect(c.state).toBe('resolved');
    });

    it('resolves race conditions by ignoring obsolete stale promises', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          const v = trigger.value;
          await sleep(v === 0 ? 50 : 10);
          return v;
        },
        { defaultValue: -1 }
      );

      c.value; // Run 1 (50ms latency)
      trigger.value = 1;
      await sleep(5);
      c.value; // Run 2 (10ms latency) - Intercepts!

      await sleep(60);
      expect(c.value).toBe(1); // the latest valid state wins
    });
  });
});
