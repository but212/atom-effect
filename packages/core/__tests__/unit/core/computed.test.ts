/**
 * @fileoverview Computed Behavior Tests
 * @description Verifies validation, async flows, caching strategies, and lifecycle management.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError, ComputedError } from '@/errors';
import { BRAND, BrandFlags } from '@/symbols';
import { isAtom, isComputed } from '@/utils/type-guards';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Computed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface InternalComputed<T = unknown> {
    value: T;
    isDirty: boolean;
    _isDirty(): boolean;
    _hasErrorInternal: boolean;
    _track(): void;
    _finalizeResolution(value: T): void;
    _deps: {
      truncateFrom(index: number): void;
      size: number;
    };
    _hotIndex: number;
    invalidate(): void;
  }

  describe('Identity & Validation', () => {
    it('assigns unique identity and proper brands for valid computed instances', () => {
      const c1 = computed(() => 1);
      const c2 = computed(() => 2);

      expect(isAtom(c1)).toBe(true);
      expect(isComputed(c1)).toBe(true);
      expect((c1 as unknown as { [BRAND]?: number })[BRAND]! & BrandFlags.Writable).toBeFalsy();
      expect((c1 as unknown as { id: number }).id).not.toBe((c2 as unknown as { id: number }).id);
    });

    it('throws errors when initialized with invalid arguments or handlers', () => {
      const c = computed(() => 1);
      expect(() => computed(null as unknown as () => void)).toThrow(ComputedError);
      expect(() => c.subscribe('invalid' as unknown as () => void)).toThrow(AtomError);
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
  });

  describe('State & Reactivity (Lazy & Caching)', () => {
    it('does not evaluate the computation function until first accessed', () => {
      const src = atom(0);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn) as unknown as { state: string; isPending: boolean };

      expect(c.state).toBe('idle');
      expect(c.isPending).toBe(false);
      expect(fn).not.toHaveBeenCalled();
    });

    it('caches the result and skips recomputation on subsequent accesses', () => {
      const fn = vi.fn(() => 42);
      const c = computed(fn) as unknown as { value: number; state: string };

      expect(c.value).toBe(42);
      expect(c.state).toBe('resolved');
      expect(fn).toHaveBeenCalledTimes(1);

      c.value;
      c.value;
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('recomputes automatically and bumps version when dependencies change', async () => {
      const src = atom(0);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn) as unknown as { value: number; version: number };

      c.value; // Access to establish dependency
      const v0 = c.version;

      src.value = 5;
      await waitForScheduler();

      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(c.version).toBeGreaterThan(v0);
    });

    it('skips recomputation if the dependency update yields the same structural value', async () => {
      const src = atom(5);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn);

      c.value; // first evaluation
      src.value = 5; // identical value update
      await waitForScheduler();

      c.value;
      expect(fn).toHaveBeenCalledTimes(1);
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

  describe('Coverage Gaps', () => {
    it('Internal getters and track method', () => {
      const c = computed(() => 1) as unknown as InternalComputed;
      expect(c.isDirty).toBe(true);
      expect(c._hasErrorInternal).toBe(false);
      c.value; // Evaluate
      expect(c.isDirty).toBe(false);

      // Manually trigger _track
      expect(() => c._track()).not.toThrow();
    });

    it('Pending/Rejected states without default value throw', async () => {
      // Pending without default
      const p = computed(async () => {
        await sleep(10);
        return 1;
      }) as unknown as InternalComputed;

      // Trigger evaluation
      try {
        p.value;
      } catch {
        // expected
      }
      expect(() => p.value).toThrow(ComputedError);

      // Rejected without default
      const r = computed(() => {
        throw new Error('fail');
      }) as unknown as InternalComputed;
      expect(() => r.value).toThrow(ComputedError);

      // Double check the return value branch (line 174)
      r._finalizeResolution(42);
      expect(r.value).toBe(42);
    });

    it('Dev-mode warnings for failed dependency evaluation', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Case 1: Dependency throws during _recompute commit (lines 359-360)
      const dep1 = atom(0);
      const c1 = computed(() => {
        dep1.value;
        throw new Error('computation fail');
      }) as unknown as InternalComputed;

      // Mock truncateFrom to throw
      vi.spyOn(c1._deps, 'truncateFrom').mockImplementationOnce(() => {
        throw new Error('truncate fail');
      });

      // Recompute happens here. It will throw because _handleError rethrows.
      expect(() => c1.value).toThrow();
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('_commitDeps failed'),
        expect.anything()
      );

      // Case 2: Dependency throws during dirty check (lines 495-496)
      const dep2 = computed(() => {
        throw new Error('dep fail');
      });
      const c2 = computed(() => {
        try {
          return dep2.value;
        } catch {
          return 0;
        }
      }) as unknown as InternalComputed;

      c2.value; // established dependency
      dep2.invalidate(); // make it dirty

      // dirty check should happen here
      c2._isDirty();
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('threw during dirty check'));
    });

    it('ReactiveNode hot-path dirty check (base.ts 245-261)', async () => {
      const a = atom(0);
      const b = computed(() => a.value); // b is a computed dep
      const c = computed(() => b.value) as unknown as InternalComputed;

      c.value; // establishes deps, _hotIndex = -1

      // Make 'a' dirty, which makes 'b' dirty
      a.value = 1;

      // Before reading c.value, it's dirty because 'a' changed.
      expect(c._isDirty()).toBe(true);

      // Recompute c by reading its value, making it clean
      void c.value;

      // Check dirtiness (now clean)
      // We verify hotIndex is set during the deep check
      expect(c._hotIndex).toBeGreaterThanOrEqual(0);

      // If we re-set a.value to same thing, it might still trigger notify but version won't change
      // But setting it to new value 2 makes it dirty again
      a.value = 2;
      expect(c._isDirty()).toBe(true); // Hits Phase 1 (line 250-255) in base.ts
    });
  });
});
