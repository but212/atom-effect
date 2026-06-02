/**
 * @fileoverview Computed Behavior Tests
 * @description Refined test suite focusing on core behaviors: Lazy evaluation, Caching, and Error Handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AtomError,
  aeNextTick,
  atom,
  ComputedError,
  computed,
  effect,
  isComputed,
  mergeAtoms,
} from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Computed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Mechanics', () => {
    it('should initialize correctly and reject invalid arguments', () => {
      const c = computed(() => 1);
      expect(isComputed(c)).toBe(true);
      expect(c).toBeDefined();

      // Invalid arguments validation
      expect(() => computed(null as unknown as () => void)).toThrow(ComputedError);
      expect(() => c.subscribe(null as unknown as () => void)).toThrow(AtomError);
    });

    it('should evaluate lazily and cache results', async () => {
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

    it('should respect equality checks to prune recomputations', async () => {
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
      spy.mockClear();

      src.value = { x: 1 }; // Structurally different, logically same
      await aeNextTick();

      expect(c.value).toEqual({ x: 1 });
      expect(fn).toHaveBeenCalledTimes(2); // Re-evaluation occurs to check equality
      expect(spy).not.toHaveBeenCalled(); // Effect skipped because result was "equal"
    });

    it('should not bump version when value is equal after re-computation', async () => {
      const src = atom(1);
      const fn = vi.fn(() => ({ v: Math.floor(src.value / 10) }));
      const c = computed(fn, {
        equal: (a, b) => a.v === b.v,
      });

      c.value; // initial: { v: 0 }
      const v1 = (c as unknown as { version: number }).version;

      src.value = 2; // still { v: 0 }
      await aeNextTick();
      c.value;
      const v2 = (c as unknown as { version: number }).version;

      // Version should not change since the computed result is "equal"
      expect(fn).toHaveBeenCalledTimes(2);
      expect(v2).toBe(v1);
    });

    it('peek() should return stale cached value without recomputation', async () => {
      const src = atom(1);
      const fn = vi.fn(() => src.value * 10);
      const c = computed(fn);

      // Trigger first evaluation
      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);

      // Mutate source
      src.value = 5;
      await aeNextTick();

      // peek() should return old cached value without recomputing
      expect(c.peek()).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);

      // .value should trigger recomputation
      expect(c.value).toBe(50);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should cache pure constant computed (zero dependencies) without repeated recomputation', () => {
      let callCount = 0;
      const c = computed(() => {
        callCount++;
        return 42;
      });

      expect(c.value).toBe(42);
      expect(callCount).toBe(1);

      // Second access: should NOT recompute since nothing changed
      expect(c.value).toBe(42);
      expect(callCount).toBe(1);
    });

    it('should not false-positive circular dependency during diamond dependency', async () => {
      const root = atom(1);
      const left = computed(() => root.value + 1);
      const right = computed(() => root.value + 2);
      const diamond = computed(() => left.value + right.value);

      expect(diamond.value).toBe(5); // 2 + 3

      root.value = 10;
      await aeNextTick();

      // Diamond pattern should resolve correctly, not throw circular dependency
      expect(diamond.value).toBe(23); // 11 + 12
    });
  });

  describe('Error Handling', () => {
    it('should capture and expose computation errors', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const c = computed(
        () => {
          throw new Error('computation_failed');
        },
        {
          onError: () => {
            throw new Error('handler_failed');
          },
        }
      );

      expect(() => c.value).toThrow(ComputedError);
      expect(c.hasError).toBe(true);
      expect(c.lastError?.message).toContain('computation_failed');
      expect(consoleError).toHaveBeenCalled(); // Internal handler error caught
    });

    it('should recover from stack overflow without leaving RECOMPUTING flag dirty', () => {
      const start = atom(0);
      let depthTarget = computed(() => start.value);
      for (let i = 0; i < 1500; i++) {
        const prev = depthTarget;
        depthTarget = computed(() => prev.value + 1);
      }

      // First evaluation triggers stack overflow (RangeError) internally or during computation.
      // We expect it to throw a RangeError or a ComputedError wrapping RangeError.
      let firstError: unknown;
      try {
        depthTarget.value;
      } catch (e) {
        firstError = e;
      }

      expect(firstError).toBeDefined();
      expect((firstError as Error).message).not.toContain('Circular dependency');

      // Second evaluation: should still fail due to stack overflow,
      // NOT because of 'Circular dependency detected' which indicates state corruption.
      let secondError: unknown;
      try {
        depthTarget.value;
      } catch (e) {
        secondError = e;
      }

      expect(secondError).toBeDefined();
      expect((secondError as Error).message).not.toContain('Circular dependency');
    });

    it('should recover from system error (ReferenceError) and maintain tracking context integrity', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const c1 = computed(() => {
        throw new ReferenceError('Mock ReferenceError');
      });

      // When we access c1, it should throw ReferenceError
      expect(() => c1.value).toThrow(ReferenceError);

      // Verify that subsequent reactive evaluations are tracked correctly under their own context
      const src = atom(0);
      const c2 = computed(() => src.value * 2);
      expect(c2.value).toBe(0);

      const spy = vi.fn();
      const sub = effect(() => {
        c2.value;
        spy();
      });

      expect(spy).toHaveBeenCalledTimes(1);

      src.value = 1;
      await aeNextTick();
      expect(spy).toHaveBeenCalledTimes(2);

      sub.dispose();
      consoleError.mockRestore();
    });

    it('should surface error state when lazy:false computation throws', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const c = computed(
        () => {
          throw new Error('eager_failure');
        },
        { lazy: false }
      );

      // After eager evaluation failure, the node should be in error state
      expect(c.hasError).toBe(true);
      expect(c.lastError).not.toBeNull();
      expect(c.lastError?.message).toContain('eager_failure');
      consoleError.mockRestore();
    });

    it('should clear error state when computation recovers from error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      let shouldFail = true;
      const src = atom(0);
      const c = computed(() => {
        const v = src.value;
        if (shouldFail) throw new Error('transient_error');
        return v;
      });

      // First: error
      expect(() => c.value).toThrow();
      expect(c.hasError).toBe(true);

      // Recover
      shouldFail = false;
      c.invalidate();

      const val = c.value;
      expect(val).toBe(0);
      expect(c.hasError).toBe(false);
      expect(c.lastError).toBeNull();
      expect(c.isRejected).toBe(false);
      consoleError.mockRestore();
    });

    it('should aggregate errors from upstream computed dependencies', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failing = computed(() => {
        throw new Error('upstream_error');
      });
      const downstream = computed(() => {
        try {
          return failing.value;
        } catch {
          return 'fallback';
        }
      });

      downstream.value;

      // downstream itself didn't fail, but upstream did
      // errors should aggregate upstream errors
      const errs = downstream.errors;
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some((e) => e.message.includes('upstream_error'))).toBe(true);
      consoleError.mockRestore();
    });
  });

  describe('Asynchronous Flows', () => {
    it('should manage pending states and default values', async () => {
      const c = computed(
        async () => {
          await sleep(20);
          return 'resolved';
        },
        { defaultValue: 'loading' }
      );

      expect(c.value).toBe('loading');
      expect(c.isPending).toBe(true);

      await sleep(30);
      expect(c.value).toBe('resolved');
      expect(c.isResolved).toBe(true);
    });

    it('should resolve race conditions by preferring the latest request', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          const v = trigger.value;
          await sleep(v === 0 ? 50 : 10);
          return v;
        },
        { defaultValue: -1 }
      );

      c.value; // Request 0
      trigger.value = 1;
      await sleep(5);
      c.value; // Request 1

      await sleep(60);
      expect(c.value).toBe(1); // Latest request wins
    });

    it('should enforce single-microtask resolution consistency', async () => {
      let resolvePromise!: (v: string) => void;
      const promise = new Promise<string>((r) => {
        resolvePromise = r;
      });

      const c = computed(() => promise, { defaultValue: 'loading' });

      expect(c.value).toBe('loading');
      resolvePromise('done');

      // Check: Should be resolved in the very next microtask
      await Promise.resolve();

      expect(c.isResolved).toBe(true);
      expect(c.value).toBe('done');
    });

    it('should throw if accessed during pending state without default value', async () => {
      const p = computed(async () => {
        await sleep(10);
        return 1;
      });
      expect(() => p.value).toThrow(ComputedError);
    });

    it('should finalize async value even if dependency changed during await', async () => {
      const trigger = atom(1);
      const c = computed(
        async () => {
          const v = trigger.value;
          await sleep(30);
          return `result-${v}`;
        },
        { defaultValue: 'loading' }
      );

      // Initial: triggers first computation
      expect(c.value).toBe('loading');

      // Mutate dependency during the pending phase
      trigger.value = 2;
      await sleep(5);

      // Access to trigger second computation
      c.value;

      // Wait for both promises to settle
      await sleep(50);

      // The second computation should have resolved
      expect(c.isResolved).toBe(true);
      expect(c.value).toBe('result-2');
    });

    it('should safely dispose while async computation is pending', async () => {
      const c = computed(
        async () => {
          await sleep(50);
          return 'done';
        },
        { defaultValue: 'loading' }
      );

      expect(c.value).toBe('loading');
      expect(c.isPending).toBe(true);

      c.dispose();

      // After dispose, the pending promise should not resurrect the node
      await sleep(60);

      expect(c.isDisposed).toBe(true);
      // The late-arriving promise resolution should not change disposed state
      expect(c.isResolved).toBe(false);
      expect(c.isDisposed).toBe(true);
    });

    it('should call onError and set REJECTED state on async rejection', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onErrorSpy = vi.fn();
      const c = computed(
        async () => {
          await sleep(10);
          throw new Error('async_failure');
        },
        { defaultValue: 'loading', onError: onErrorSpy }
      );

      expect(c.value).toBe('loading');
      await sleep(20);

      expect(c.isRejected).toBe(true);
      expect(c.hasError).toBe(true);
      expect(onErrorSpy).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('should transition through correct async state lifecycle', async () => {
      let resolvePromise!: (v: number) => void;
      const c = computed(
        () =>
          new Promise<number>((r) => {
            resolvePromise = r;
          }),
        { defaultValue: 0 }
      );

      // Before first access, state is IDLE
      // After first access with async, state should be PENDING
      c.value;
      expect(c.state).toBe('pending');

      resolvePromise(42);
      await Promise.resolve();

      expect(c.state).toBe('resolved');
    });
  });

  describe('Reactive Integrity', () => {
    it('should maintain chain reactivity and cleanup on dispose', async () => {
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

    it('should clear internal references in unsubscribe returned closure to prevent memory leaks', () => {
      const src = atom(1);
      const c = computed(() => src.value * 2);
      const spy = vi.fn();
      const unsub = c.subscribe(spy);

      expect(c.subscriberCount()).toBe(1);
      unsub();
      expect(c.subscriberCount()).toBe(0);

      // Verify calling unsubscribe again does not throw or cause issues
      expect(() => unsub()).not.toThrow();
    });

    it('should not retain subscriptions after disposal', () => {
      const c = computed(() => 1);
      c.dispose();

      const unsub = c.subscribe(() => {});

      expect(c.subscriberCount()).toBe(0);
      expect(() => unsub()).not.toThrow();
    });

    it('should prevent dependency leakage through meta-state access', () => {
      const dep = atom(0);
      const child = computed(() => dep.value);
      const parent = computed(() => child.hasError);

      const spy = vi.fn();
      const tracker = computed(() => parent.hasError);
      tracker.subscribe(spy);
      tracker.value;

      dep.value = 1; // child changes, but parent.hasError is still false
      expect(spy).not.toHaveBeenCalled();
    });

    it('should return last known value from peek() after dispose', () => {
      const c = computed(() => 42);
      expect(c.value).toBe(42);

      c.dispose();

      // peek() should still return the last computed value
      expect(c.peek()).toBe(42);
    });

    it('should not allow invalidate() after dispose()', () => {
      const c = computed(() => 1);
      c.value;
      c.dispose();

      // invalidate on a disposed node should either throw or be a no-op
      // It should NOT revive the node or cause flag corruption
      c.invalidate();

      expect(c.isDisposed).toBe(true);
      expect(() => c.value).toThrow(ComputedError);
    });

    it('should propagate notifications even when multiple dependencies change before read', async () => {
      const a = atom(1);
      const b = atom(10);
      const c = computed(() => a.value + b.value);

      const spy = vi.fn();
      c.subscribe(spy);
      c.value; // initialize
      spy.mockClear();

      // Change both dependencies rapidly
      a.value = 2;
      b.value = 20;
      await aeNextTick();

      // The effect should have been notified at least once
      expect(spy).toHaveBeenCalled();
      expect(c.value).toBe(22);
    });
  });

  describe('Advanced Composition: Object Merging', () => {
    it('should merge multiple atoms into an intersected object', () => {
      const a = atom({ id: 1, name: 'Atom A' });
      const b = atom({ version: '1.0.0', tags: ['core'] });
      const merged = mergeAtoms(a, b);

      expect(merged.value).toEqual({
        id: 1,
        name: 'Atom A',
        version: '1.0.0',
        tags: ['core'],
      });
    });

    it('should respect merge priority (last atom wins on key collision)', () => {
      const a = atom({ x: 1, y: 1 });
      const b = atom({ y: 2, z: 3 });
      const merged = mergeAtoms(a, b);

      expect(merged.value).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should reactively update when any source atom changes', async () => {
      const a = atom({ x: 1 });
      const b = atom({ y: 1 });
      const merged = mergeAtoms(a, b);

      const spy = vi.fn();
      effect(() => {
        spy(merged.value);
      });
      spy.mockClear();

      a.value = { x: 10 };
      await aeNextTick();
      expect(spy).toHaveBeenCalledWith({ x: 10, y: 1 });

      b.value = { y: 20 };
      await aeNextTick();
      expect(spy).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('should support mixed source types (Atoms and Computed)', async () => {
      const base = atom(100);
      const a = computed(() => ({ val: base.value }));
      const b = atom({ active: true });
      const merged = mergeAtoms(a, b);

      expect(merged.value).toEqual({ val: 100, active: true });

      base.value = 200;
      await aeNextTick();
      expect(merged.value).toEqual({ val: 200, active: true });
    });

    it('mergeAtoms should handle or reject atoms with primitive values', () => {
      const a = atom(42 as unknown as Record<string, unknown>);
      const b = atom('hello' as unknown as Record<string, unknown>);
      const merged = mergeAtoms(a, b);

      // The merged value should either contain the primitive values
      // or throw an error — silently returning {} is incorrect
      const result = merged.value;
      expect(Object.keys(result as object).length).toBeGreaterThan(0);
    });
  });
});
