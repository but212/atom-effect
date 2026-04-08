/**
 * @fileoverview Computed Behavioral & Regression tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomError, ComputedError } from '@/errors';
import { atom, computed } from '@/index';
import { ATOM_BRAND, COMPUTED_BRAND } from '@/symbols';
import { sleep, waitForScheduler } from '../../utils/test-helpers';

describe('Computed', () => {
  afterEach(() => vi.restoreAllMocks());

  // Helper interface for internal property access in tests
  interface InternalComputed<T = unknown> {
    [ATOM_BRAND]: boolean;
    [COMPUTED_BRAND]: boolean;
    id: number;
    flags: number;
    version: number;
    value: T;
    _value: T;
    _deps: { size: number; getAt(idx: number): unknown };
    _hotIndex: number;
    _trackCount: number;
    _promiseId: number;
    _error: Error | null;
    _fn: Function | null;
    _onError: ((err: Error) => void) | null;
    hasError: boolean;
    subscribe(listener: (val: T) => void): () => void;
    subscriberCount(): number;
    invalidate(): void;
    dispose(): void;
    _isDirty(): boolean;
  }

  describe('Identity & Resource Lifecycle', () => {
    it('initializes with proper brands and unique identity', () => {
      const c1 = computed(() => 1) as unknown as InternalComputed;
      const c2 = computed(() => 2) as unknown as InternalComputed;
      expect(c1[ATOM_BRAND]).toBe(true);
      expect(c1[COMPUTED_BRAND]).toBe(true);
      expect(c1.id).not.toBe(c2.id);
    });

    it('denies invalid initialization and subscription', () => {
      const c = computed(() => 1);
      expect(() => computed(null as unknown as () => number)).toThrow(ComputedError);
      expect(() => c.subscribe('invalid' as unknown as (v: number) => void)).toThrow(AtomError);
    });

    it('exhaustively cleans up resources and denies usage after dispose()', () => {
      const handler = () => {};
      const c = computed(() => 1, { onError: handler }) as unknown as InternalComputed;
      c.subscribe(() => {});

      c.dispose();

      // Behavioral behavior after disposal
      expect(() => c.value).toThrow(ComputedError);
      expect(c.subscriberCount()).toBe(0);

      // Memory safety (Bug 1 regression)
      expect(c._fn).toBeNull();
      expect(c._onError).toBeNull();
    });
  });

  describe('Reactivity & Performance', () => {
    it('is lazy and caches stable results', async () => {
      const src = atom(0);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn);

      expect(fn).not.toHaveBeenCalled();
      expect(c.value).toBe(0);
      expect(c.value).toBe(0);
      expect(fn).toHaveBeenCalledTimes(1);

      src.value = 5;
      await waitForScheduler();
      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('tracks only active dependencies and prunes on branch switches', async () => {
      const toggle = atom(true);
      const a = atom('A');
      const b = atom('B');
      let runs = 0;
      const c = computed(() => {
        runs++;
        return toggle.value ? a.value : b.value;
      });

      c.value; // depends on toggle, a
      expect(runs).toBe(1);

      b.value = 'B2';
      await waitForScheduler();
      c.value;
      expect(runs).toBe(1); // b change ignored

      toggle.value = false;
      await waitForScheduler();
      expect(c.value).toBe('B2');
      expect(runs).toBe(2);

      a.value = 'A2'; // a should be pruned
      await waitForScheduler();
      c.value;
      expect(runs).toBe(2); // a change ignored
    });

    it('respects custom equality and skips redundant computations', async () => {
      const src = atom({ x: 1 });
      const fn = vi.fn(() => ({ x: src.value.x }));
      const c = computed(fn, { equal: (a, b) => a.x === b.x }) as unknown as InternalComputed;

      c.value;
      const v0 = c.version;

      src.value = { x: 1 }; // logically same content, but new object ref
      await waitForScheduler();
      c.value;

      // fn must be called to check the new result, but version should not change
      expect(fn).toHaveBeenCalledTimes(2);
      expect(c.version).toBe(v0);
    });

    it('supports O(1) hot-path dirty checks for optimization', () => {
      const a = atom(0);
      const b = computed(() => a.value);
      const c = computed(() => b.value) as unknown as InternalComputed;

      c.value; // established
      a.value = 1;
      expect(c._isDirty()).toBe(true);
      expect(c._hotIndex).toBeGreaterThanOrEqual(0); // hot path hit

      void c.value; // clean
      expect(c._hotIndex).toBe(-1);
    });
  });

  describe('Error Handling & Robustness', () => {
    it('propagates errors and bumps version correctly (Sync/Async)', async () => {
      const src = atom(0);
      const c = computed(() => {
        if (src.value === 1) throw new Error('fail');
        return src.value;
      }) as unknown as InternalComputed;

      c.value;
      const v0 = c.version;

      src.value = 1;
      expect(() => c.value).toThrow(ComputedError);
      expect(c.version).toBeGreaterThan(v0); // Bug 5 regression
      expect(c.hasError).toBe(true);

      src.value = 2; // Recovery
      expect(c.value).toBe(2);
      expect(c.hasError).toBe(false);
    });

    it('aggregates multiple upstream errors and clears them on recovery', () => {
      const a1 = atom(true, { sync: true });
      const a2 = atom(true, { sync: true });
      const x = computed(
        () => {
          if (a1.value) throw new Error('X');
          return 1;
        },
        { defaultValue: 0 }
      );
      const y = computed(
        () => {
          if (a2.value) throw new Error('Y');
          return 2;
        },
        { defaultValue: 0 }
      );
      const z = computed(() => x.value + y.value, { defaultValue: -1 });

      expect(z.value).toBe(0); // 0 + 0
      expect(z.errors.length).toBeGreaterThanOrEqual(2);

      a1.value = false;
      expect(z.value).toBe(1); // 1 + 0
      expect(z.errors.length).toBe(1);

      a2.value = false;
      expect(z.value).toBe(3); // 1 + 2
      expect(z.hasError).toBe(false);
    });

    it('prevents stack overflow on extremely deep graphs (Iterative Walk)', () => {
      const errorNode = computed(() => {
        throw new Error('err');
      });

      // Simple chain
      const c1 = computed(() => errorNode.value, { defaultValue: 0 });
      c1.value;
      expect((errorNode as unknown as InternalComputed).hasError).toBe(true);
      expect((c1 as unknown as InternalComputed).hasError).toBe(true);

      // Recursive link to deep chain (reduced to 10 for pinpointing)
      let root = c1 as unknown as InternalComputed;
      for (let i = 0; i < 10; i++) {
        const prev = root;
        root = computed(() => prev.value, { defaultValue: 0 }) as unknown as InternalComputed;
      }

      // Evaluate full chain
      root.value;

      // Check intermediate nodes
      expect(root.hasError).toBe(true);

      // Now grow it back to 1000 to check iterative safety
      for (let i = 0; i < 1000; i++) {
        const prev = root;
        root = computed(() => prev.value, { defaultValue: 0 }) as unknown as InternalComputed;
      }
      root.value;
      expect(() => root.hasError).not.toThrow();
      expect(root.hasError).toBe(true);
    });

    it('handles dev-mode warnings for failed dependency evaluations', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dep = computed(() => {
        throw new Error('fail');
      });
      const c = computed(() => {
        try {
          return dep.value;
        } catch {
          return 0;
        }
      }) as unknown as InternalComputed;

      c.value; // establish
      dep.invalidate();
      c._isDirty(); // triggers warn in dirty check
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('threw during dirty check'));
    });
  });

  describe('Asynchronous Behavior', () => {
    it('flows through transition states with race condition handling', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          const v = trigger.value;
          await sleep(v === 0 ? 40 : 10);
          return v;
        },
        { defaultValue: -1 }
      );

      c.value; // Request 1 (0, 40ms)
      trigger.value = 1;
      await sleep(5);
      c.value; // Request 2 (1, 10ms) - Overrides

      await sleep(50);
      expect(c.value).toBe(1); // Request 2 wins
    });

    it('resets HAS_ERROR flag immediately when starting new async recompute', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          if (trigger.value === 0) throw new Error('fail');
          await sleep(10);
          return 42;
        },
        { defaultValue: -1 }
      );

      c.value;
      await sleep(20);
      expect(c.hasError).toBe(true);

      trigger.value = 1;
      c.value; // Start pending
      expect(c.state).toBe('pending');
      expect(c.hasError).toBe(false); // Bug 3 regression: HAS_ERROR should be cleared
    });

    it('ignores resolutions for disposed instances', async () => {
      let resolvePromise: (v: number) => void;
      const promise = new Promise<number>((res) => (resolvePromise = res!));
      const c = computed(async () => promise, { defaultValue: 0 }) as unknown as InternalComputed;

      c.value; // Start pending
      c.dispose();
      resolvePromise!(42); // Resolve after dispose
      await sleep(10);

      expect(c._value).toBeUndefined(); // Bug 2 regression: state must not update
    });

    it('throws pending error if no default is provided', async () => {
      const c = computed(async () => {
        await sleep(10);
        return 1;
      });
      expect(() => c.value).toThrow(ComputedError);
      expect(() => c.value).toThrow('pending');
    });
  });
});
