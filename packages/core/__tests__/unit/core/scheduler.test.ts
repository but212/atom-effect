import { Result } from '@but212/atom-effect-utils';
import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it, vi } from 'vitest';
import { SCHEDULER_STATE } from '@/constants';
import { trackingContext } from '@/core/base';
import {
  aeNextTick,
  batch,
  runInFlushScope,
  scheduler,
  schedulerEndBatch,
  schedulerGetQueueSize,
  schedulerIsBatching,
  schedulerSchedule,
  schedulerSetMaxFlushIterations,
} from '@/core/scheduler';
import { atom, computed, effect, SCHEDULER_CONFIG, SchedulerError } from '@/index';

describe('Scheduler Engine', () => {
  describe('schedulerSchedule()', () => {
    it('manages job lifecycle: deduplication, async execution, and queue drainage', async () => {
      const job1 = vi.fn();
      const job2 = vi.fn();

      schedulerSchedule(scheduler, job1);
      schedulerSchedule(scheduler, job1);
      schedulerSchedule(scheduler, job2);

      expect(schedulerGetQueueSize(scheduler)).toBe(2);
      expect(job1).not.toHaveBeenCalled();

      await sleep(10);

      expect(job1).toHaveBeenCalledTimes(1);
      expect(job2).toHaveBeenCalledTimes(1);
      expect(schedulerGetQueueSize(scheduler)).toBe(0);
    });

    it('ensures nested schedules are deferred to the next iteration (double buffering)', async () => {
      const log: string[] = [];
      const nestedJob = vi.fn(() => log.push('nested'));
      const initialJob = vi.fn(() => {
        log.push('initial');
        schedulerSchedule(scheduler, nestedJob);
        expect(schedulerGetQueueSize(scheduler)).toBe(1);
      });

      schedulerSchedule(scheduler, initialJob);
      await sleep(10);

      expect(log).toEqual(['initial', 'nested']);
      expect(initialJob).toHaveBeenCalledTimes(1);
      expect(nestedJob).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid scheduler callback types', () => {
      // @ts-expect-error Testing invalid callback type
      expect(() => schedulerSchedule(scheduler, null)).toThrow(SchedulerError);
    });
  });

  describe('batch()', () => {
    it('coalesces updates and maintains data consistency', () => {
      const someAtom = atom(0);
      const computedInstance = computed(() => someAtom.value + 1);
      const log: number[] = [];

      effect(() => {
        log.push(someAtom.value);
      });
      log.length = 0; // Clear initial run

      const batchResult = batch(() => {
        someAtom.value = 1;
        expect(computedInstance.value).toBe(2);
        someAtom.value = 10;
        return 'done';
      });

      expect(batchResult).toBe('done');
      expect(log).toEqual([10]);
      expect(computedInstance.value).toBe(11);
    });

    it('recovers from errors while preserving pending changes', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const someAtom = atom(0);

      expect(() => {
        batch(() => {
          someAtom.value = 42;
          throw new Error('batch-fail');
        });
      }).toThrow('batch-fail');

      expect(someAtom.value).toBe(42);
      expect(schedulerIsBatching(scheduler)).toBe(false);
      consoleError.mockRestore();
    });

    it('prevents stack overflow through flat execution loops', () => {
      const maxDepth = 500;
      const batchedCallback = (depth: number) => {
        if (depth > 0) batch(() => batchedCallback(depth - 1));
      };

      expect(() => batchedCallback(maxDepth)).not.toThrow();
    });

    it('handles nested batch scopes correctly', () => {
      const log: string[] = [];

      batch(() => {
        log.push('outer-start');
        batch(() => {
          log.push('inner');
        });
        log.push('outer-end');
      });

      expect(log).toEqual(['outer-start', 'inner', 'outer-end']);
    });

    it('warns on unbalanced endBatch calls', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      schedulerEndBatch(scheduler);
      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });
  });

  describe('aeNextTick()', () => {
    it('should wait for all reactive updates to be flushed', async () => {
      const someAtom = atom(0);
      let capturedValue = -1;
      effect(() => {
        capturedValue = someAtom.value;
      });

      someAtom.value = 42;
      expect(capturedValue).toBe(0);

      await aeNextTick();
      expect(capturedValue).toBe(42);
    });

    it('should execute optional callback and resolve correctly', async () => {
      const callback = vi.fn();
      await aeNextTick(callback);
      expect(callback).toHaveBeenCalled();
    });

    it('should propagate errors from the callback', async () => {
      const error = new Error('tick-fail');
      await expect(
        aeNextTick(() => {
          throw error;
        })
      ).rejects.toThrow('tick-fail');
    });
  });

  describe('error isolation & recovery', () => {
    it('isolates job errors to prevent scheduler lockup', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failingJob = vi.fn(() => {
        throw new Error('isolated-fail');
      });
      const successJob = vi.fn();

      schedulerSchedule(scheduler, failingJob);
      schedulerSchedule(scheduler, successJob);

      await sleep(10);

      expect(failingJob).toHaveBeenCalled();
      expect(successJob).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('detects and halts infinite loops (overflow protection)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onOverflow = vi.fn();
      scheduler.onOverflow = onOverflow;
      expect(scheduler.onOverflow).toBe(onOverflow);

      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      schedulerSetMaxFlushIterations(scheduler, 10);

      const loop = () => schedulerSchedule(scheduler, loop);
      schedulerSchedule(scheduler, loop);

      // One-shot recovery re-queues dropped jobs once; the second overflow is
      // terminal, after which the queue is fully drained again.
      await sleep(40);

      expect(onOverflow).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));
      expect(schedulerGetQueueSize(scheduler)).toBe(0);

      scheduler.onOverflow = null;
      expect(scheduler.onOverflow).toBeNull();
      schedulerSetMaxFlushIterations(scheduler, originalMax);
      consoleError.mockRestore();
    });

    it('passes dropped jobs to onOverflow as the second argument', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onOverflow = vi.fn();
      scheduler.onOverflow = onOverflow;

      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      schedulerSetMaxFlushIterations(scheduler, 10);

      const loop = () => schedulerSchedule(scheduler, loop);
      schedulerSchedule(scheduler, loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalled();
      const droppedCall = onOverflow.mock.calls[0];
      const droppedJobs = (droppedCall?.[1] ?? []) as unknown[];
      expect(Array.isArray(droppedJobs)).toBe(true);
      expect(droppedJobs.length).toBeGreaterThan(0);

      scheduler.onOverflow = null;
      schedulerSetMaxFlushIterations(scheduler, originalMax);
      consoleError.mockRestore();
    });

    it('retries dropped jobs once so transient overload still converges', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      schedulerSetMaxFlushIterations(scheduler, 10);

      let executions = 0;
      const convergingJob = () => {
        executions++;
        if (executions < 100) schedulerSchedule(scheduler, convergingJob);
      };
      schedulerSchedule(scheduler, convergingJob);

      await sleep(50);

      // Without one-shot recovery the job would halt at ~5-6 executions.
      // The retry must carry it well past a single flush budget.
      expect(executions).toBeGreaterThanOrEqual(8);

      schedulerSetMaxFlushIterations(scheduler, originalMax);
      consoleError.mockRestore();
    });
  });

  describe('configuration & invariants', () => {
    it('should ensure SCHEDULER_STATE is runtime-frozen to prevent mutation', () => {
      expect(Object.isFrozen(SCHEDULER_STATE)).toBe(true);
    });

    it('should ensure SCHEDULER_CONFIG is runtime-frozen to prevent mutation', () => {
      expect(Object.isFrozen(SCHEDULER_CONFIG)).toBe(true);
    });

    it('should enforce sanity invariants on SCHEDULER_CONFIG values', () => {
      expect(SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS).toBeGreaterThan(0);
      expect(SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS).toBeGreaterThan(
        SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS
      );
      expect(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH).toBeGreaterThanOrEqual(
        SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT
      );
      expect(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND).toBeGreaterThan(0);
      expect(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT).toBeGreaterThan(0);
    });

    describe('maxFlushIterations boundaries', () => {
      it('rejects values below MIN_FLUSH_ITERATIONS', () => {
        expect(() => schedulerSetMaxFlushIterations(scheduler, 0)).toThrow();
        expect(() =>
          schedulerSetMaxFlushIterations(scheduler, SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS - 1)
        ).toThrow();
      });

      it('rejects NaN values', () => {
        expect(() => schedulerSetMaxFlushIterations(scheduler, Number.NaN)).toThrow();
      });

      it('rejects non-integer decimal values', () => {
        expect(() => schedulerSetMaxFlushIterations(scheduler, 10.5)).toThrow();
      });
    });

    describe('batch inputs and runInFlushScope', () => {
      it('batch throws TypeError when parameter is not a function', () => {
        // @ts-expect-error - testing invalid parameter type
        expect(() => batch(null)).toThrow(TypeError);
      });

      it('runInFlushScope executes successfully', () => {
        let executed = false;
        const flushScopeResult = runInFlushScope(() => {
          executed = true;
          return 'success';
        });
        expect(executed).toBe(true);
        expect(flushScopeResult).toBe('success');
      });

      it('resets tracking context if flushQueues throws in queueMicrotask', async () => {
        const spy = vi.spyOn(scheduler, 'flushQueues').mockImplementation(() => {
          throw new Error('Test flushQueues error');
        });

        let uncaughtError: Error | null = null;
        const handler = (error: unknown) => {
          uncaughtError = error as Error;
        };
        process.on('uncaughtException', handler);

        const originalTrackingContext = trackingContext.current;
        // @ts-expect-error - mock context
        trackingContext.current = { id: 999 };

        schedulerSchedule(scheduler, () => {});

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

        expect(uncaughtError).not.toBeNull();
        expect((uncaughtError as Error | null)?.message).toBe('Test flushQueues error');
        expect(trackingContext.current).toBeNull();

        process.off('uncaughtException', handler);
        trackingContext.current = originalTrackingContext;
        spy.mockRestore();
      });

      it('startFlush returns false and console.warns when already active', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const first = scheduler.startFlush();
        expect(first).toBe(true);

        const second = scheduler.startFlush();
        expect(second).toBe(false);
        expect(consoleWarn).toHaveBeenCalled();

        scheduler.endFlush();
        consoleWarn.mockRestore();
      });

      it('incrementFlushExecutionCount returns error when limit is exceeded', () => {
        const started = scheduler.startFlush();
        expect(started).toBe(true);

        // Run 10000 times (the MAX_EXECUTIONS_PER_FLUSH threshold)
        for (let i = 0; i < 10000; i++) {
          const res = scheduler.incrementFlushExecutionCount();
          expect(Result.isOk(res)).toBe(true);
        }

        // The 10001st call should exceed the limit and return an error
        const overflowRes = scheduler.incrementFlushExecutionCount();
        expect(Result.isErr(overflowRes)).toBe(true);
        expect(overflowRes.error?.message).toContain('Infinite loop detected: limit exceeded');

        scheduler.endFlush();
      });
    });
  });
});
