import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it, vi } from 'vitest';
import { SCHEDULER_STATE } from '@/constants';
import {
  aeNextTick,
  batch,
  scheduler,
  schedulerEndBatch,
  schedulerIsBatching,
  schedulerQueueSize,
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

      expect(schedulerQueueSize(scheduler)).toBe(2);
      expect(job1).not.toHaveBeenCalled();

      await sleep(10);

      expect(job1).toHaveBeenCalledTimes(1);
      expect(job2).toHaveBeenCalledTimes(1);
      expect(schedulerQueueSize(scheduler)).toBe(0);
    });

    it('ensures nested schedules are deferred to the next iteration (double buffering)', async () => {
      const log: string[] = [];
      const nestedJob = vi.fn(() => log.push('nested'));
      const initialJob = vi.fn(() => {
        log.push('initial');
        schedulerSchedule(scheduler, nestedJob);
        expect(schedulerQueueSize(scheduler)).toBe(1);
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
      const a = atom(0);
      const c = computed(() => a.value + 1);
      const log: number[] = [];

      effect(() => {
        log.push(a.value);
      });
      log.length = 0; // Clear initial run

      const result = batch(() => {
        a.value = 1;
        expect(c.value).toBe(2);
        a.value = 10;
        return 'done';
      });

      expect(result).toBe('done');
      expect(log).toEqual([10]);
      expect(c.value).toBe(11);
    });

    it('recovers from errors while preserving pending changes', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      expect(() => {
        batch(() => {
          a.value = 42;
          throw new Error('batch-fail');
        });
      }).toThrow('batch-fail');

      expect(a.value).toBe(42);
      expect(schedulerIsBatching(scheduler)).toBe(false);
      consoleError.mockRestore();
    });

    it('prevents stack overflow through flat execution loops', () => {
      const depth = 500;
      const fn = (d: number) => {
        if (d > 0) batch(() => fn(d - 1));
      };

      expect(() => fn(depth)).not.toThrow();
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
      const a = atom(0);
      let capturedValue = -1;
      effect(() => {
        capturedValue = a.value;
      });

      a.value = 42;
      expect(capturedValue).toBe(0);

      await aeNextTick();
      expect(capturedValue).toBe(42);
    });

    it('should execute optional callback and resolve correctly', async () => {
      const cb = vi.fn();
      await aeNextTick(cb);
      expect(cb).toHaveBeenCalled();
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
      const fail = vi.fn(() => {
        throw new Error('isolated-fail');
      });
      const success = vi.fn();

      schedulerSchedule(scheduler, fail);
      schedulerSchedule(scheduler, success);

      await sleep(10);

      expect(fail).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('detects and halts infinite loops (overflow protection)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onOverflow = vi.fn();
      scheduler.onOverflow = onOverflow;

      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      schedulerSetMaxFlushIterations(scheduler, 10);

      const loop = () => schedulerSchedule(scheduler, loop);
      schedulerSchedule(scheduler, loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));
      expect(schedulerQueueSize(scheduler)).toBe(0);

      scheduler.onOverflow = null;
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
  });
});
