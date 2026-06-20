/**
 * @fileoverview Computed Behavior Tests
 */

import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it, vi } from 'vitest';
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

describe('Computed', () => {
  describe('computed() constructor', () => {
    it('should initialize correctly and reject invalid arguments', () => {
      const c = computed(() => 1);
      expect(isComputed(c)).toBe(true);
      expect(c).toBeDefined();

      // @ts-expect-error Testing invalid computation function
      expect(() => computed(null)).toThrow(ComputedError);
    });
  });

  describe('value (getter)', () => {
    describe('lazy evaluation & caching', () => {
      it('should evaluate lazily and cache results', async () => {
        const src = atom(1);
        const fn = vi.fn(() => src.value * 2);
        const c = computed(fn);

        expect(fn).not.toHaveBeenCalled();

        expect(c.value).toBe(2);
        expect(fn).toHaveBeenCalledTimes(1);

        c.value;
        c.value;
        expect(fn).toHaveBeenCalledTimes(1);

        src.value = 5;
        await aeNextTick();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(c.value).toBe(10);
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should respect equality checks to prune recomputations', async () => {
        const src = atom({ x: 1 });
        const fn = vi.fn(() => ({ x: src.value.x }));
        const c = computed(fn, {
          equal: (a, b) => a.x === b.x,
        });

        c.value;
        const spy = vi.fn();
        effect(() => {
          c.value;
          spy();
        });
        spy.mockClear();

        src.value = { x: 1 };
        await aeNextTick();

        expect(c.value).toEqual({ x: 1 });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(spy).not.toHaveBeenCalled();
      });

      it('should cache pure constant computed (zero dependencies) without repeated recomputation', () => {
        let callCount = 0;
        const c = computed(() => {
          callCount++;
          return 42;
        });

        expect(c.value).toBe(42);
        expect(callCount).toBe(1);

        expect(c.value).toBe(42);
        expect(callCount).toBe(1);
      });

      it('should not pass the previous value to the computation function', async () => {
        const src = atom(1);
        const fn = vi.fn((...args: unknown[]) => {
          expect(args.length).toBe(0);
          return src.value * 2;
        });
        const c = computed(fn);
        expect(c.value).toBe(2);
        src.value = 2;
        await aeNextTick();
        expect(c.value).toBe(4);
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    describe('internal state getters', () => {
      it('should correctly expose internal getters: isDirty, isRecomputing, and isValid', () => {
        const a = atom(0, { sync: true });
        const c = computed(() => {
          expect(Reflect.get(c, 'isRecomputing')).toBe(true);
          return a.value * 2;
        });

        expect(Reflect.get(c, 'isDirty')).toBe(true);
        expect(Reflect.get(c, 'isRecomputing')).toBe(false);
        expect(Reflect.get(c, 'isValid')).toBe(true);

        c.subscribe(() => {});

        expect(c.value).toBe(0);
        expect(Reflect.get(c, 'isDirty')).toBe(false);

        a.value = 1;
        expect(Reflect.get(c, 'isDirty')).toBe(true);
        expect(c.value).toBe(2);
        expect(Reflect.get(c, 'isDirty')).toBe(false);
      });
    });

    describe('dependency resolution', () => {
      it('should not false-positive circular dependency during diamond dependency', async () => {
        const root = atom(1);
        const left = computed(() => root.value + 1);
        const right = computed(() => root.value + 2);
        const diamond = computed(() => left.value + right.value);

        expect(diamond.value).toBe(5);

        root.value = 10;
        await aeNextTick();

        expect(diamond.value).toBe(23);
      });

      it('should keep computed derivations pure and handle state changes inside effects', async () => {
        const a = atom(1);
        const c = computed(() => a.value * 2);

        let effectRunCount = 0;
        effect(() => {
          c.value;
          effectRunCount++;
        });

        expect(c.value).toBe(2);
        expect(effectRunCount).toBe(1);

        a.value = 2;
        await aeNextTick();
        expect(c.value).toBe(4);
        expect(effectRunCount).toBe(2);
      });
    });
  });

  describe('version', () => {
    it('should not bump version when value is equal after re-computation', async () => {
      const src = atom(1);
      const fn = vi.fn(() => ({ v: Math.floor(src.value / 10) }));
      const c = computed(fn, {
        equal: (a, b) => a.v === b.v,
      });

      c.value;
      const v1 = c.version;

      src.value = 2;
      await aeNextTick();
      c.value;
      const v2 = c.version;

      expect(fn).toHaveBeenCalledTimes(2);
      expect(v2).toBe(v1);
    });
  });

  describe('peek()', () => {
    it('should return stale cached value without recomputation', async () => {
      const src = atom(1);
      const fn = vi.fn(() => src.value * 10);
      const c = computed(fn);

      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);

      src.value = 5;
      await aeNextTick();

      expect(c.peek()).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);

      expect(c.value).toBe(50);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should return last known value from peek() after dispose', () => {
      const c = computed(() => 42);
      expect(c.value).toBe(42);

      c.dispose();

      expect(c.peek()).toBe(42);
    });
  });

  describe('subscribe()', () => {
    it('rejects invalid subscriber arguments', () => {
      const c = computed(() => 1);
      // @ts-expect-error Testing invalid subscriber
      expect(() => c.subscribe(null)).toThrow(AtomError);
    });

    it('should clear internal references in unsubscribe returned closure to prevent memory leaks', () => {
      const src = atom(1);
      const c = computed(() => src.value * 2);
      const spy = vi.fn();
      const unsub = c.subscribe(spy);

      expect(c.subscriberCount()).toBe(1);
      unsub();
      expect(c.subscriberCount()).toBe(0);

      expect(() => unsub()).not.toThrow();
    });

    it('should not retain subscriptions after disposal', () => {
      const c = computed(() => 1);
      c.dispose();

      const unsub = c.subscribe(() => {});

      expect(c.subscriberCount()).toBe(0);
      expect(() => unsub()).not.toThrow();
    });

    it('should not allocate _slots or register target when subscribing to a disposed computed', () => {
      const c = computed(() => 1);
      c.dispose();
      const unsub = c.subscribe(() => {});
      expect(Reflect.get(c, '_slots')).toBeNull();
      unsub();
    });

    it('should propagate notifications even when multiple dependencies change before read', async () => {
      const a = atom(1);
      const b = atom(10);
      const c = computed(() => a.value + b.value);

      const spy = vi.fn();
      c.subscribe(spy);
      c.value;
      spy.mockClear();

      a.value = 2;
      b.value = 20;
      await aeNextTick();

      expect(spy).toHaveBeenCalled();
      expect(c.value).toBe(22);
    });
  });

  describe('invalidate()', () => {
    it('should not allow invalidate() after dispose()', () => {
      const c = computed(() => 1);
      c.value;
      c.dispose();

      c.invalidate();

      expect(c.isDisposed).toBe(true);
      expect(() => c.value).toThrow(ComputedError);
    });
  });

  describe('hasError', () => {
    it('should prevent dependency leakage through meta-state access', () => {
      const dep = atom(0);
      const child = computed(() => dep.value);
      const parent = computed(() => child.hasError);

      const spy = vi.fn();
      const tracker = computed(() => parent.hasError);
      tracker.subscribe(spy);
      tracker.value;

      dep.value = 1;
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('errors & error propagation', () => {
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
      expect(consoleError).toHaveBeenCalled();
    });

    it('should recover from stack overflow without leaving RECOMPUTING flag dirty', () => {
      const start = atom(0);
      let depthTarget = computed(() => start.value);
      for (let i = 0; i < 1500; i++) {
        const prev = depthTarget;
        depthTarget = computed(() => prev.value + 1);
      }

      let firstError: unknown;
      try {
        depthTarget.value;
      } catch (e) {
        firstError = e;
      }

      expect(firstError).toBeDefined();
      expect(Reflect.get(firstError as object, 'message')).not.toContain('Circular dependency');

      let secondError: unknown;
      try {
        depthTarget.value;
      } catch (e) {
        secondError = e;
      }

      expect(secondError).toBeDefined();
      expect(Reflect.get(secondError as object, 'message')).not.toContain('Circular dependency');
    });

    it('should recover from system error (ReferenceError) and maintain tracking context integrity', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const c1 = computed(() => {
        throw new ReferenceError('Mock ReferenceError');
      });

      expect(() => c1.value).toThrow(ReferenceError);

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

      expect(() => c.value).toThrow();
      expect(c.hasError).toBe(true);

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

      const errs = downstream.errors;
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some((e) => e.message.includes('upstream_error'))).toBe(true);
      consoleError.mockRestore();
    });
  });

  describe('asynchronous flows', () => {
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

      c.value;
      trigger.value = 1;
      await sleep(5);
      c.value;

      await sleep(60);
      expect(c.value).toBe(1);
    });

    it('should enforce single-microtask resolution consistency', async () => {
      let resolvePromise!: (v: string) => void;
      const promise = new Promise<string>((r) => {
        resolvePromise = r;
      });

      const c = computed(() => promise, { defaultValue: 'loading' });

      expect(c.value).toBe('loading');
      resolvePromise('done');

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

      expect(c.value).toBe('loading');

      trigger.value = 2;
      await sleep(5);

      c.value;

      await sleep(50);

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

      await sleep(60);

      expect(c.isDisposed).toBe(true);
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

      c.value;
      expect(c.state).toBe('pending');

      resolvePromise(42);
      await Promise.resolve();

      expect(c.state).toBe('resolved');
    });
  });

  describe('dispose()', () => {
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
  });

  describe('mergeAtoms()', () => {
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
      const a = atom(42);
      const b = atom('hello');
      const merged = mergeAtoms(a, b);

      const result = merged.value;
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });
  });
});
