/**
 * @fileoverview Computed Behavior Tests
 */

import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it, vi } from 'vitest';
import { scheduler } from '@/core/scheduler';
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
      const computedInstance = computed(() => 1);
      expect(isComputed(computedInstance)).toBe(true);
      expect(computedInstance).toBeDefined();

      // @ts-expect-error Testing invalid computation function
      expect(() => computed(null)).toThrow(ComputedError);
    });
  });

  describe('value (getter)', () => {
    describe('lazy evaluation & caching', () => {
      it('should evaluate lazily and cache results', async () => {
        const source = atom(1);
        const computationCallback = vi.fn(() => source.value * 2);
        const computedInstance = computed(computationCallback);

        expect(computationCallback).not.toHaveBeenCalled();

        expect(computedInstance.value).toBe(2);
        expect(computationCallback).toHaveBeenCalledTimes(1);

        computedInstance.value;
        computedInstance.value;
        expect(computationCallback).toHaveBeenCalledTimes(1);

        source.value = 5;
        await aeNextTick();
        expect(computationCallback).toHaveBeenCalledTimes(1);
        expect(computedInstance.value).toBe(10);
        expect(computationCallback).toHaveBeenCalledTimes(2);
      });

      it('should respect equality checks to prune recomputations', async () => {
        const source = atom({ x: 1 });
        const computationCallback = vi.fn(() => ({ x: source.value.x }));
        const computedInstance = computed(computationCallback, {
          equal: (a, b) => a.x === b.x,
        });

        computedInstance.value;
        const spy = vi.fn();
        effect(() => {
          computedInstance.value;
          spy();
        });
        spy.mockClear();

        source.value = { x: 1 };
        await aeNextTick();

        expect(computedInstance.value).toEqual({ x: 1 });
        expect(computationCallback).toHaveBeenCalledTimes(2);
        expect(spy).not.toHaveBeenCalled();
      });

      it('should cache pure constant computed (zero dependencies) without repeated recomputation', () => {
        let callCount = 0;
        const computedInstance = computed(() => {
          callCount++;
          return 42;
        });

        expect(computedInstance.value).toBe(42);
        expect(callCount).toBe(1);

        expect(computedInstance.value).toBe(42);
        expect(callCount).toBe(1);
      });

      it('should not pass the previous value to the computation function', async () => {
        const source = atom(1);
        const computationCallback = vi.fn((...args: unknown[]) => {
          expect(args.length).toBe(0);
          return source.value * 2;
        });
        const computedInstance = computed(computationCallback);
        expect(computedInstance.value).toBe(2);
        source.value = 2;
        await aeNextTick();
        expect(computedInstance.value).toBe(4);
        expect(computationCallback).toHaveBeenCalledTimes(2);
      });
    });

    describe('internal state getters', () => {
      it('should correctly expose internal getters: isDirty, isRecomputing, and isValid', () => {
        const someAtom = atom(0, { sync: true });
        const computedInstance = computed(() => {
          expect(Reflect.get(computedInstance, 'isRecomputing')).toBe(true);
          return someAtom.value * 2;
        });

        expect(Reflect.get(computedInstance, 'isDirty')).toBe(true);
        expect(Reflect.get(computedInstance, 'isRecomputing')).toBe(false);
        expect(Reflect.get(computedInstance, 'isValid')).toBe(true);

        computedInstance.subscribe(() => {});

        expect(computedInstance.value).toBe(0);
        expect(Reflect.get(computedInstance, 'isDirty')).toBe(false);

        someAtom.value = 1;
        expect(Reflect.get(computedInstance, 'isDirty')).toBe(true);
        expect(computedInstance.value).toBe(2);
        expect(Reflect.get(computedInstance, 'isDirty')).toBe(false);
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
        const someAtom = atom(1);
        const computedInstance = computed(() => someAtom.value * 2);

        let effectRunCount = 0;
        effect(() => {
          computedInstance.value;
          effectRunCount++;
        });

        expect(computedInstance.value).toBe(2);
        expect(effectRunCount).toBe(1);

        someAtom.value = 2;
        await aeNextTick();
        expect(computedInstance.value).toBe(4);
        expect(effectRunCount).toBe(2);
      });
    });
  });

  describe('version', () => {
    it('should not bump version when value is equal after re-computation', async () => {
      const source = atom(1);
      const computationCallback = vi.fn(() => ({ value: Math.floor(source.value / 10) }));
      const computedInstance = computed(computationCallback, {
        equal: (a, b) => a.value === b.value,
      });

      computedInstance.value;
      const firstVersion = computedInstance.version;

      source.value = 2;
      await aeNextTick();
      computedInstance.value;
      const secondVersion = computedInstance.version;

      expect(computationCallback).toHaveBeenCalledTimes(2);
      expect(secondVersion).toBe(firstVersion);
    });
  });

  describe('peek()', () => {
    it('should return stale cached value without recomputation', async () => {
      const source = atom(1);
      const computationCallback = vi.fn(() => source.value * 10);
      const computedInstance = computed(computationCallback);

      expect(computedInstance.value).toBe(10);
      expect(computationCallback).toHaveBeenCalledTimes(1);

      source.value = 5;
      await aeNextTick();

      expect(computedInstance.peek()).toBe(10);
      expect(computationCallback).toHaveBeenCalledTimes(1);

      expect(computedInstance.value).toBe(50);
      expect(computationCallback).toHaveBeenCalledTimes(2);
    });

    it('should return last known value from peek() after dispose', () => {
      const computedInstance = computed(() => 42);
      expect(computedInstance.value).toBe(42);

      computedInstance.dispose();

      expect(computedInstance.peek()).toBe(42);
    });
  });

  describe('subscribe()', () => {
    it('rejects invalid subscriber arguments', () => {
      const computedInstance = computed(() => 1);
      // @ts-expect-error Testing invalid subscriber
      expect(() => computedInstance.subscribe(null)).toThrow(AtomError);
    });

    it('should clear internal references in unsubscribe returned closure to prevent memory leaks', () => {
      const source = atom(1);
      const computedInstance = computed(() => source.value * 2);
      const spy = vi.fn();
      const unsubscribeCallback = computedInstance.subscribe(spy);

      expect(computedInstance.subscriberCount()).toBe(1);
      unsubscribeCallback();
      expect(computedInstance.subscriberCount()).toBe(0);

      expect(() => unsubscribeCallback()).not.toThrow();
    });

    it('should not retain subscriptions after disposal', () => {
      const computedInstance = computed(() => 1);
      computedInstance.dispose();

      const unsubscribeCallback = computedInstance.subscribe(() => {});

      expect(computedInstance.subscriberCount()).toBe(0);
      expect(() => unsubscribeCallback()).not.toThrow();
    });

    it('should not allocate _subscriberSlots or register target when subscribing to a disposed computed', () => {
      const computedInstance = computed(() => 1);
      computedInstance.dispose();
      const unsubscribeCallback = computedInstance.subscribe(() => {});
      expect(Reflect.get(computedInstance, '_subscriberSlots')).toBeNull();
      unsubscribeCallback();
    });

    it('should propagate notifications even when multiple dependencies change before read', async () => {
      const firstAtom = atom(1);
      const secondAtom = atom(10);
      const computedInstance = computed(() => firstAtom.value + secondAtom.value);

      const spy = vi.fn();
      computedInstance.subscribe(spy);
      computedInstance.value;
      spy.mockClear();

      firstAtom.value = 2;
      secondAtom.value = 20;
      await aeNextTick();

      expect(spy).toHaveBeenCalled();
      expect(computedInstance.value).toBe(22);
    });
  });

  describe('invalidate()', () => {
    it('should not allow invalidate() after dispose()', () => {
      const computedInstance = computed(() => 1);
      computedInstance.value;
      computedInstance.dispose();

      computedInstance.invalidate();

      expect(computedInstance.isDisposed).toBe(true);
      expect(() => computedInstance.value).toThrow(ComputedError);
    });
  });

  describe('hasError', () => {
    it('should prevent dependency leakage through meta-state access', () => {
      const dependency = atom(0);
      const child = computed(() => dependency.value);
      const parent = computed(() => child.hasError);

      const spy = vi.fn();
      const tracker = computed(() => parent.hasError);
      tracker.subscribe(spy);
      tracker.value;

      dependency.value = 1;
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('errors & error propagation', () => {
    it('should capture and expose computation errors', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const computedInstance = computed(
        () => {
          throw new Error('computation_failed');
        },
        {
          onError: () => {
            throw new Error('handler_failed');
          },
        }
      );

      expect(() => computedInstance.value).toThrow(ComputedError);
      expect(computedInstance.hasError).toBe(true);
      expect(computedInstance.lastError?.message).toContain('computation_failed');
      expect(consoleError).toHaveBeenCalled();
    });

    it('should recover from stack overflow without leaving RECOMPUTING flag dirty', () => {
      const start = atom(0);
      let depthTarget = computed(() => start.value);
      for (let i = 0; i < 1500; i++) {
        const previousComputed = depthTarget;
        depthTarget = computed(() => previousComputed.value + 1);
      }

      let firstError: unknown;
      try {
        depthTarget.value;
      } catch (err) {
        firstError = err;
      }

      expect(firstError).toBeDefined();
      expect(Reflect.get(firstError as object, 'message')).not.toContain('Circular dependency');

      let secondError: unknown;
      try {
        depthTarget.value;
      } catch (err) {
        secondError = err;
      }

      expect(secondError).toBeDefined();
      expect(Reflect.get(secondError as object, 'message')).not.toContain('Circular dependency');
    });

    it('should recover from system error (ReferenceError) and maintain tracking context integrity', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const computed1 = computed(() => {
        throw new ReferenceError('Mock ReferenceError');
      });

      expect(() => computed1.value).toThrow(ReferenceError);

      const source = atom(0);
      const computed2 = computed(() => source.value * 2);
      expect(computed2.value).toBe(0);

      const spy = vi.fn();
      const subscribe = effect(() => {
        computed2.value;
        spy();
      });

      expect(spy).toHaveBeenCalledTimes(1);

      source.value = 1;
      await aeNextTick();
      expect(spy).toHaveBeenCalledTimes(2);

      subscribe.dispose();
      consoleError.mockRestore();
    });

    it('should preserve dependencies when computed evaluation throws a system error (e.g., ReferenceError)', () => {
      const firstAtom = atom(1);
      const secondAtom = atom(2);

      let shouldThrow = false;
      const computedInstance = computed(() => {
        firstAtom.value;
        if (shouldThrow) {
          throw new ReferenceError('System-level error simulating bug');
        }
        secondAtom.value;
        return 10;
      });

      computedInstance.value;
      expect((computedInstance as unknown as { _depSlots: { size: number } })._depSlots.size).toBe(
        2
      );

      shouldThrow = true;
      firstAtom.value = 2;
      scheduler.flushSync();
      expect(() => computedInstance.value).toThrow(ReferenceError);

      // 3. Since a ReferenceError was thrown, nodeCommitDeps was bypassed.
      // Therefore, the dependency to `secondAtom` should be preserved on the error path.
      expect(secondAtom.subscriberCount()).toBe(1);
    });

    it('should surface error state when lazy:false computation throws', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const computedInstance = computed(
        () => {
          throw new Error('eager_failure');
        },
        { lazy: false }
      );

      expect(computedInstance.hasError).toBe(true);
      expect(computedInstance.lastError).not.toBeNull();
      expect(computedInstance.lastError?.message).toContain('eager_failure');
      consoleError.mockRestore();
    });

    it('should clear error state when computation recovers from error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      let shouldFail = true;
      const source = atom(0);
      const computedInstance = computed(() => {
        const value = source.value;
        if (shouldFail) throw new Error('transient_error');
        return value;
      });

      expect(() => computedInstance.value).toThrow();
      expect(computedInstance.hasError).toBe(true);

      shouldFail = false;
      computedInstance.invalidate();

      const value = computedInstance.value;
      expect(value).toBe(0);
      expect(computedInstance.hasError).toBe(false);
      expect(computedInstance.lastError).toBeNull();
      expect(computedInstance.isRejected).toBe(false);
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
      const computedInstance = computed(
        async () => {
          await sleep(20);
          return 'resolved';
        },
        { defaultValue: 'loading' }
      );

      expect(computedInstance.value).toBe('loading');
      expect(computedInstance.isPending).toBe(true);

      await sleep(30);
      expect(computedInstance.value).toBe('resolved');
      expect(computedInstance.isResolved).toBe(true);
    });

    it('should resolve race conditions by preferring the latest request', async () => {
      const trigger = atom(0);
      const computedInstance = computed(
        async () => {
          const value = trigger.value;
          await sleep(value === 0 ? 50 : 10);
          return value;
        },
        { defaultValue: -1 }
      );

      computedInstance.value;
      trigger.value = 1;
      await sleep(5);
      computedInstance.value;

      await sleep(60);
      expect(computedInstance.value).toBe(1);
    });

    it('should enforce single-microtask resolution consistency', async () => {
      let resolvePromise!: (value: string) => void;
      const promise = new Promise<string>((r) => {
        resolvePromise = r;
      });

      const computedInstance = computed(() => promise, { defaultValue: 'loading' });

      expect(computedInstance.value).toBe('loading');
      resolvePromise('done');

      await Promise.resolve();

      expect(computedInstance.isResolved).toBe(true);
      expect(computedInstance.value).toBe('done');
    });

    it('should throw if accessed during pending state without default value', async () => {
      const pendingComputed = computed(async () => {
        await sleep(10);
        return 1;
      });
      expect(() => pendingComputed.value).toThrow(ComputedError);
    });

    it('should finalize async value even if dependency changed during await', async () => {
      const trigger = atom(1);
      const computedInstance = computed(
        async () => {
          const value = trigger.value;
          await sleep(30);
          return `result-${value}`;
        },
        { defaultValue: 'loading' }
      );

      expect(computedInstance.value).toBe('loading');

      trigger.value = 2;
      await sleep(5);

      computedInstance.value;

      await sleep(50);

      expect(computedInstance.isResolved).toBe(true);
      expect(computedInstance.value).toBe('result-2');
    });

    it('should safely dispose while async computation is pending', async () => {
      const computedInstance = computed(
        async () => {
          await sleep(50);
          return 'done';
        },
        { defaultValue: 'loading' }
      );

      expect(computedInstance.value).toBe('loading');
      expect(computedInstance.isPending).toBe(true);

      computedInstance.dispose();

      await sleep(60);

      expect(computedInstance.isDisposed).toBe(true);
      expect(computedInstance.isResolved).toBe(false);
      expect(computedInstance.isDisposed).toBe(true);
    });

    it('should call onError and set REJECTED state on async rejection', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onErrorSpy = vi.fn();
      const computedInstance = computed(
        async () => {
          await sleep(10);
          throw new Error('async_failure');
        },
        { defaultValue: 'loading', onError: onErrorSpy }
      );

      expect(computedInstance.value).toBe('loading');
      await sleep(20);

      expect(computedInstance.isRejected).toBe(true);
      expect(computedInstance.hasError).toBe(true);
      expect(onErrorSpy).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('should transition through correct async state lifecycle', async () => {
      let resolvePromise!: (value: number) => void;
      const computedInstance = computed(
        () =>
          new Promise<number>((r) => {
            resolvePromise = r;
          }),
        { defaultValue: 0 }
      );

      computedInstance.value;
      expect(computedInstance.state).toBe('pending');

      resolvePromise(42);
      await Promise.resolve();

      expect(computedInstance.state).toBe('resolved');
    });
  });

  describe('dispose()', () => {
    it('should maintain chain reactivity and cleanup on dispose', async () => {
      const someAtom = atom(1);
      const computedB = computed(() => someAtom.value + 1);
      const computedC = computed(() => computedB.value * 2);

      expect(computedC.value).toBe(4);

      const spy = vi.fn();
      const unsubscribeCallback = computedC.subscribe(spy);
      expect(computedC.subscriberCount()).toBe(1);

      someAtom.value = 5;
      await aeNextTick();
      expect(spy).toHaveBeenCalled();
      expect(computedC.value).toBe(12);

      computedC.dispose();
      expect(() => computedC.value).toThrow(ComputedError);
      expect(computedC.subscriberCount()).toBe(0);
      unsubscribeCallback();
    });
  });

  describe('mergeAtoms()', () => {
    it('should merge multiple atoms into an intersected object', () => {
      const firstAtom = atom({ id: 1, name: 'Atom A' });
      const secondAtom = atom({ version: '1.0.0', tags: ['core'] });
      const merged = mergeAtoms(firstAtom, secondAtom);

      expect(merged.value).toEqual({
        id: 1,
        name: 'Atom A',
        version: '1.0.0',
        tags: ['core'],
      });
    });

    it('should respect merge priority (last atom wins on key collision)', () => {
      const firstAtom = atom({ x: 1, y: 1 });
      const secondAtom = atom({ y: 2, z: 3 });
      const merged = mergeAtoms(firstAtom, secondAtom);

      expect(merged.value).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should reactively update when any source atom changes', async () => {
      const firstAtom = atom({ x: 1 });
      const secondAtom = atom({ y: 1 });
      const merged = mergeAtoms(firstAtom, secondAtom);

      const spy = vi.fn();
      effect(() => {
        spy(merged.value);
      });
      spy.mockClear();

      firstAtom.value = { x: 10 };
      await aeNextTick();
      expect(spy).toHaveBeenCalledWith({ x: 10, y: 1 });

      secondAtom.value = { y: 20 };
      await aeNextTick();
      expect(spy).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('should support mixed source types (Atoms and Computed)', async () => {
      const base = atom(100);
      const computedA = computed(() => ({ value: base.value }));
      const atomB = atom({ active: true });
      const merged = mergeAtoms(computedA, atomB);

      expect(merged.value).toEqual({ value: 100, active: true });

      base.value = 200;
      await aeNextTick();
      expect(merged.value).toEqual({ value: 200, active: true });
    });

    it('mergeAtoms should handle or reject atoms with primitive values', () => {
      const firstAtom = atom(42);
      const secondAtom = atom('hello');
      const merged = mergeAtoms(firstAtom, secondAtom);

      const mergedResult = merged.value;
      expect(Object.keys(mergedResult).length).toBeGreaterThan(0);
    });
  });
});
