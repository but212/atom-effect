/**
 * @fileoverview Effect Behavior Tests
 */

import { Result } from '@but212/atom-effect-utils';
import { sleep } from '@tests/utils/test-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atom, computed, EffectError, effect, globalScheduler } from '@/index';

describe('Effect', () => {
  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    describe('effect() constructor & lifecycle', () => {
      it('rejects invalid constructor inputs', () => {
        // @ts-expect-error Testing invalid constructor input
        expect(() => effect(null)).toThrow(EffectError);
        // @ts-expect-error Testing invalid constructor input
        expect(() => effect('invalid')).toThrow(EffectError);
      });

      it('maintains correct initial state', async () => {
        const effectInstance = effect(() => {});
        expect(effectInstance.isDisposed).toBe(false);

        await vi.runAllTimersAsync();
        expect(effectInstance.isExecuting).toBe(false);
        expect(effectInstance.executionCount).toBe(1);

        effectInstance.dispose();
      });

      it('isExecuting flags active execution periods', async () => {
        const someAtom = atom(0);
        let capturedExecuting = false;
        let effectReference: ReturnType<typeof effect> | null = null;

        const effectInstance = effect(() => {
          someAtom.value;
          if (effectReference) capturedExecuting = effectReference.isExecuting;
        });
        effectReference = effectInstance;

        await vi.runAllTimersAsync();
        someAtom.value = 1;
        await vi.runAllTimersAsync();

        expect(capturedExecuting).toBe(true);
        expect(effectInstance.isExecuting).toBe(false);

        effectInstance.dispose();
      });
    });

    describe('reactivity & dependency tracking', () => {
      it('tracks deep dependencies (atoms/computeds) and re-executes on actual changes', async () => {
        const source = atom(0);
        const untracked = atom(0);
        const doubled = computed(() => source.value * 2);

        const log: number[] = [];
        const effectInstance = effect(() => {
          log.push(doubled.value);
        });

        await vi.runAllTimersAsync();
        expect(log).toEqual([0]);
        expect(effectInstance.executionCount).toBe(1);

        untracked.value = 99;
        await vi.runAllTimersAsync();
        expect(log).toEqual([0]);

        source.value = 0;
        await vi.runAllTimersAsync();
        expect(effectInstance.executionCount).toBe(1);

        source.value = 5;
        await vi.runAllTimersAsync();
        expect(log).toEqual([0, 10]);
        expect(effectInstance.executionCount).toBe(2);

        effectInstance.dispose();
      });

      it('handles errors when checking if computed dependencies are dirty', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const someAtom = atom(0);
        let throwInComputed = false;
        const computedInstance = computed(() => {
          if (throwInComputed) throw new Error('computed throw');
          return someAtom.value;
        });

        let runs = 0;
        const effectInstance = effect(() => {
          computedInstance.value;
          runs++;
        });
        await vi.runAllTimersAsync();

        throwInComputed = true;
        someAtom.value = 1;
        await vi.runAllTimersAsync();

        expect(consoleWarnSpy).toHaveBeenCalled();
        expect(runs).toBe(1);
        effectInstance.dispose();
      });

      it('should remain reactive after the effect function throws before accessing any dependency', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);
        let shouldThrow = false;
        let runs = 0;

        const effectInstance = effect(
          () => {
            if (shouldThrow) throw new Error('boom before deps');
            someAtom.value;
            runs++;
          },
          { onError: () => {} }
        );

        await vi.runAllTimersAsync();
        expect(runs).toBe(1);

        shouldThrow = true;
        someAtom.value = 1;
        await vi.runAllTimersAsync();

        shouldThrow = false;
        someAtom.value = 2;
        await vi.runAllTimersAsync();

        expect(runs).toBe(2);
        effectInstance.dispose();
        consoleSpy.mockRestore();
      });

      it('should preserve unvisited dependencies when the function throws mid-tracking', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const firstAtom = atom(0);
        const secondAtom = atom(0);
        let shouldThrow = false;
        let runs = 0;

        const effectInstance = effect(
          () => {
            firstAtom.value;
            if (shouldThrow) throw new Error('boom mid-tracking');
            secondAtom.value;
            runs++;
          },
          { onError: () => {} }
        );

        await vi.runAllTimersAsync();
        expect(runs).toBe(1);

        shouldThrow = true;
        firstAtom.value = 1;
        await vi.runAllTimersAsync();

        shouldThrow = false;

        secondAtom.value = 99;
        await vi.runAllTimersAsync();

        expect(runs).toBe(2);
        effectInstance.dispose();
        consoleSpy.mockRestore();
      });

      it('should not truncate dependencies on the error path to preserve existing subscription counts', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const firstAtom = atom(0);
        const secondAtom = atom(0);
        const thirdAtom = atom(0);
        let throwOnRun = false;
        const capturedValues: number[] = [];

        const effectInstance = effect(
          () => {
            if (throwOnRun) throw new Error('kaboom');
            capturedValues.push(firstAtom.value + secondAtom.value + thirdAtom.value);
          },
          { onError: () => {} }
        );

        await vi.runAllTimersAsync();
        expect(capturedValues).toEqual([0]);

        const aSubsBefore = firstAtom.subscriberCount();
        const bSubsBefore = secondAtom.subscriberCount();
        const cSubsBefore = thirdAtom.subscriberCount();

        expect(aSubsBefore).toBeGreaterThanOrEqual(1);
        expect(bSubsBefore).toBeGreaterThanOrEqual(1);
        expect(cSubsBefore).toBeGreaterThanOrEqual(1);

        throwOnRun = true;
        firstAtom.value = 1;
        await vi.runAllTimersAsync();

        expect(firstAtom.subscriberCount()).toBe(aSubsBefore);
        expect(secondAtom.subscriberCount()).toBe(bSubsBefore);
        expect(thirdAtom.subscriberCount()).toBe(cSubsBefore);

        effectInstance.dispose();
        consoleSpy.mockRestore();
      });

      it('should handle cases where the dependency buffer is disposed mid-execution gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);
        let effectB: ReturnType<typeof effect> | null = null;

        const effectA = effect(
          () => {
            someAtom.value;
            if (effectB && !effectB.isDisposed) effectB.dispose();
          },
          { sync: true }
        );

        effectB = effect(
          () => {
            someAtom.value;
          },
          { sync: true }
        );

        expect(() => {
          someAtom.value = 1;
        }).not.toThrow();

        await vi.runAllTimersAsync();
        expect(effectB.isDisposed).toBe(true);

        effectA.dispose();
        consoleSpy.mockRestore();
      });

      it('should return Result.ok(false) from prepareExecution when executing re-entrantly', () => {
        const someAtom = atom(0, { sync: true });
        let effectInstance: unknown;
        let executions = 0;
        effectInstance = effect(
          () => {
            executions++;
            someAtom.value;
            if (executions === 2) {
              const executionResult = (
                effectInstance as { execute: () => Result<void, Error> }
              ).execute();
              expect(Result.isOk(executionResult)).toBe(true);
            }
          },
          { sync: true }
        );

        someAtom.value = 1;
        expect(executions).toBe(2);
      });
    });

    describe('run()', () => {
      it('forces an immediate synchronous re-execution', async () => {
        let count = 0;
        const effectInstance = effect(() => {
          count++;
        });
        await vi.runAllTimersAsync();

        effectInstance.run();
        expect(count).toBe(2);

        effectInstance.dispose();
        expect(() => effectInstance.run()).toThrow(EffectError);
      });
    });

    describe('dispose() & cleanups', () => {
      it('orchestrates cleanup properly on re-runs and final disposal idempotently', async () => {
        const source = atom(0, { sync: true });
        const order: string[] = [];

        const effectInstance = effect(
          () => {
            source.value;
            order.push('run');
            return () => order.push('cleanup');
          },
          { sync: true }
        );

        source.value = 1;
        await vi.runAllTimersAsync();

        effectInstance.dispose();

        expect(order).toEqual(['run', 'cleanup', 'run', 'cleanup']);
        expect(effectInstance.isDisposed).toBe(true);
      });

      it('gracefully handles missing or invalid cleanup returns', async () => {
        // @ts-expect-error Testing invalid cleanup return
        const effectInstance = effect(() => 'invalid');
        await vi.runAllTimersAsync();
        expect(() => effectInstance.dispose()).not.toThrow();
      });

      it('severs reactivity after disposal', async () => {
        const source = atom(0);
        let runs = 0;
        const effectInstance = effect(() => {
          source.value;
          runs++;
        });
        await vi.runAllTimersAsync();

        effectInstance.dispose();
        source.value = 1;
        await vi.runAllTimersAsync();
        expect(runs).toBe(1);
      });

      it('should not corrupt dependency tracking when cleanup errors occur during execution', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);
        let cleanupShouldThrow = true;
        let runs = 0;

        const effectInstance = effect(
          () => {
            someAtom.value;
            runs++;
            return () => {
              if (cleanupShouldThrow) {
                cleanupShouldThrow = false;
                throw new Error('cleanup boom');
              }
            };
          },
          { onError: () => {} }
        );

        await vi.runAllTimersAsync();
        expect(runs).toBe(1);

        someAtom.value = 1;
        await vi.runAllTimersAsync();
        expect(runs).toBe(2);

        someAtom.value = 2;
        await vi.runAllTimersAsync();
        expect(runs).toBe(3);

        effectInstance.dispose();
        consoleSpy.mockRestore();
      });
    });

    describe('errors & safeguards', () => {
      it('localizes execution errors & triggers onError without crashing flows', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onError = vi.fn(() => {
          throw new Error('onError fail');
        });

        const someAtom = atom(0);
        const effectInstance = effect(
          () => {
            someAtom.value;
            throw new Error('Exec Fail');
          },
          { onError }
        );

        await vi.runAllTimersAsync();

        expect(consoleSpy).toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(EffectError));
        expect(() => effectInstance.dispose()).not.toThrow();
        expect(effectInstance.isDisposed).toBe(true);
      });

      it('handles errors in synchronous cleanups and maintains reactivity', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);
        let runCount = 0;

        const effectInstance = effect(() => {
          someAtom.value;
          runCount++;
          return () => {
            throw new Error('sync cleanup error');
          };
        });
        await vi.runAllTimersAsync();
        expect(runCount).toBe(1);

        someAtom.value = 1;
        await vi.runAllTimersAsync();

        expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
        expect(runCount).toBe(2);

        someAtom.value = 2;
        await vi.runAllTimersAsync();
        expect(runCount).toBe(3);

        effectInstance.dispose();
      });

      it('should remain reactive on subsequent runs after recovering from an error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);
        let shouldThrow = false;
        let runs = 0;

        const effectInstance = effect(
          () => {
            if (shouldThrow) throw new Error('boom');
            someAtom.value;
            runs++;
          },
          { onError: () => {} }
        );

        await vi.runAllTimersAsync();
        expect(runs).toBe(1);

        shouldThrow = true;
        someAtom.value = 1;
        await vi.runAllTimersAsync();

        shouldThrow = false;
        effectInstance.run();
        expect(runs).toBe(2);

        someAtom.value = 2;
        await vi.runAllTimersAsync();

        expect(runs).toBe(3);
        effectInstance.dispose();
        consoleSpy.mockRestore();
      });
    });

    describe('edge cases', () => {
      it('handles dependency slot overflows (index >= 4)', async () => {
        const atoms = Array.from({ length: 6 }, (_, i) => atom(i));
        const effectInstance = effect(() => {
          for (const someAtom of atoms) {
            someAtom.value;
          }
        });
        await vi.runAllTimersAsync();
        expect(effectInstance.executionCount).toBe(1);

        const a5 = atoms[5];
        if (!a5) throw new Error('Setup failed');
        a5.value = 100;
        await vi.runAllTimersAsync();
        expect(effectInstance.executionCount).toBe(2);
        effectInstance.dispose();
      });

      it('handles errors when a dependency subscription fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onError = vi.fn();
        const badDep = atom(0);
        vi.spyOn(badDep, 'subscribe').mockImplementation(() => {
          throw new Error('subscribe fail');
        });

        const effectInstance = effect(
          () => {
            badDep.value;
          },
          { onError }
        );

        await vi.runAllTimersAsync();
        expect(consoleError).toHaveBeenCalled();
        expect(onError).toHaveBeenCalled();
        effectInstance.dispose();
      });

      it('runs the effect when there are no active dependencies, even if _depSlots.length is non-zero (due to null slots)', async () => {
        const effectInstance = effect(() => {});
        await vi.runAllTimersAsync();

        const depSlots = Reflect.get(effectInstance, '_depSlots');
        depSlots.lock();
        depSlots.push({ node: atom(0), version: 0, unsubscribeCallback: () => {} });
        depSlots.setAt(0, null);
        depSlots.unlock();

        expect(depSlots.length).toBe(1);
        expect(depSlots.size).toBe(0);

        const initialCount = effectInstance.executionCount;
        Reflect.get(effectInstance, 'execute').call(effectInstance, false);

        expect(effectInstance.executionCount).toBe(initialCount + 1);
        effectInstance.dispose();
      });

      it('should not log errors twice when infinite loop is detected', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        const someAtom = atom(0);
        const _effectInstance = effect(() => {
          someAtom.value;
          someAtom.value = someAtom.value + 1;
        });

        await vi.runAllTimersAsync();

        expect(consoleError).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
      });
    });
  });

  describe('with real timers', () => {
    describe('async lifecycle patterns', () => {
      it('executes async cleanups and ignores stale cleanups when superseded', async () => {
        const source = atom(0);
        const staleCleanup = vi.fn();
        const freshCleanup = vi.fn();

        const effectInstance = effect(async () => {
          const value = source.value;
          await sleep(10);
          return value === 0 ? staleCleanup : freshCleanup;
        });

        await sleep(2);
        source.value = 1;
        await sleep(30);
        effectInstance.dispose();

        expect(staleCleanup).toHaveBeenCalled();
        expect(freshCleanup).toHaveBeenCalled();
      });

      it('keeps synchronous cleanup when an older async run resolves', async () => {
        const source = atom(0, { sync: true });
        const staleCleanup = vi.fn();
        const freshCleanup = vi.fn();
        let resolveStale!: (cleanup: () => void) => void;

        const effectInstance = effect(
          () => {
            if (source.value === 0) {
              return new Promise<() => void>((resolve) => {
                resolveStale = resolve;
              });
            }
            return freshCleanup;
          },
          { sync: true }
        );

        source.value = 1;
        resolveStale(staleCleanup);
        await Promise.resolve();

        effectInstance.dispose();
        expect(staleCleanup).toHaveBeenCalledTimes(1);
        expect(freshCleanup).toHaveBeenCalledTimes(1);
      });

      it('ensures async consistency by resolving results in the first microtask cycle', async () => {
        let resolvePromise!: (value: () => void) => void;
        const promise = new Promise<() => void>((r) => {
          resolvePromise = r;
        });

        const cleanup = vi.fn();
        const effectInstance = effect(() => promise);

        await sleep(10);
        resolvePromise(cleanup);

        await Promise.resolve();

        effectInstance.dispose();
        expect(cleanup).toHaveBeenCalledTimes(1);
      });

      it('should ignore async promise rejections after effect disposal', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let rejectAsync!: (error: Error) => void;

        const effectInstance = effect(
          () =>
            new Promise<void>((_, reject) => {
              rejectAsync = reject;
            })
        );

        effectInstance.dispose();
        rejectAsync(new Error('disposed rejection'));
        await Promise.resolve();

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      it('should ignore async promise rejections after effect re-execution (stale session)', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);

        let firstReject!: (error: Error) => void;
        let secondResolve!: (value: undefined) => void;
        let runIdx = 0;

        const effectInstance = effect(() => {
          someAtom.value;
          runIdx++;
          if (runIdx === 1) {
            return new Promise((_r, rej) => {
              firstReject = rej;
            });
          }
          return new Promise((r) => {
            secondResolve = r;
          });
        });

        await sleep(5);

        someAtom.value = 1;
        await sleep(5);

        firstReject(new Error('stale rejection'));
        await sleep(10);

        expect(consoleSpy).not.toHaveBeenCalled();

        secondResolve(undefined);
        effectInstance.dispose();
        consoleSpy.mockRestore();
      });

      it('safely handles errors from async execution', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        let rejectAsync!: (value: unknown) => void;
        effect(() => new Promise((_, r) => (rejectAsync = r)));
        rejectAsync(new Error('async reject'));

        await sleep(10);
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
      });

      it('safely handles errors from async cleanups', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        let resolveAsync!: (value: () => void) => void;
        const effectInstance = effect(() => new Promise<() => void>((r) => (resolveAsync = r)));
        effectInstance.dispose();
        resolveAsync(() => {
          throw new Error('cleanup error');
        });

        await sleep(10);
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
      });
    });

    describe('frequency constraints & budgets', () => {
      it('auto-disposes to prevent infinite loops based on frequency constraints', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);

        const effectInstance = effect(
          () => {
            if (someAtom.value > 0) someAtom.value++;
          },
          { sync: true, maxExecutionsPerFlush: 3 }
        );

        someAtom.value = 1;
        await sleep(30);

        expect(effectInstance.isDisposed).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));
      });

      it('coalesces scheduled effects despite unrelated effect creation', async () => {
        const source = atom(0, { sync: true });
        let runCount = 0;

        const effectInstance = effect(() => {
          runCount++;
          source.value;
        });

        source.value = 1;
        const unrelatedEffect = effect(() => {});
        source.value = 2;
        await Promise.resolve();
        await Promise.resolve();

        expect(runCount).toBe(2);
        effectInstance.dispose();
        unrelatedEffect.dispose();
      });

      it('does not warn when a scheduled sync effect runs inside a flush', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const source = atom(0);
        const effectInstance = effect(
          () => {
            source.value;
          },
          { sync: true }
        );

        source.value = 1;
        await Promise.resolve();

        expect(consoleSpy).not.toHaveBeenCalledWith('startFlush() called during flush - ignored');
        effectInstance.dispose();
        consoleSpy.mockRestore();
      });

      it('resets the per-flush budget between independent synchronous updates', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0, { sync: true });

        const effectInstance = effect(
          () => {
            someAtom.value;
          },
          { sync: true, maxExecutionsPerFlush: 3 }
        );

        someAtom.value = 1;
        someAtom.value = 2;
        someAtom.value = 3;

        expect(effectInstance.isDisposed).toBe(false);
        expect(effectInstance.executionCount).toBe(4);
        consoleSpy.mockRestore();
      });

      it('should provide a clear error when run() is called after budget is exceeded, rather than double faulting', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0);

        const effectInstance = effect(
          () => {
            if (someAtom.value > 0) someAtom.value++;
          },
          { sync: true, maxExecutionsPerFlush: 2 }
        );

        someAtom.value = 1;
        await sleep(30);

        expect(effectInstance.isDisposed).toBe(true);

        expect(() => effectInstance.run()).toThrow(EffectError);

        consoleSpy.mockRestore();
      });

      it('disposes effect and returns error if global scheduler flush execution count limit is exceeded', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const spy = vi
          .spyOn(globalScheduler, 'incrementFlushExecutionCount')
          .mockReturnValue(Result.err(new Error('Global flush limit exceeded')));

        const someAtom = atom(0);
        expect(() => {
          effect(() => {
            someAtom.value;
          });
        }).toThrow('Global flush limit exceeded');

        spy.mockRestore();
        consoleSpy.mockRestore();
      });

      it('disposes effect when executions per second limit is exceeded', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const someAtom = atom(0, { sync: true });

        const effectInstance = effect(
          () => {
            someAtom.value;
          },
          { sync: true, maxExecutionsPerSecond: 1 }
        );

        someAtom.value = 1;

        expect(effectInstance.isDisposed).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(expect.any(EffectError));

        consoleSpy.mockRestore();
      });
    });

    describe('internal constructor validation', () => {
      it('should throw EffectMustBeFunction error when private EffectImpl constructor is invoked with a non-function', () => {
        const effectInstance = effect(() => {});
        const EffectImplClass = effectInstance.constructor;
        expect(
          () => new (EffectImplClass as unknown as new (fn: unknown) => unknown)(null)
        ).toThrow(EffectError);
      });
    });
  });
});
