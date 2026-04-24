import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aeNextTick,
  atom,
  batch,
  computed,
  effect,
  SCHEDULER_CONFIG,
  SchedulerError,
  globalScheduler as scheduler,
} from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Scheduler', () => {
  beforeEach(async () => {
    // Wait for any pending flushes and reset batch depth via public API
    await aeNextTick();
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }
  });

  describe('Core Scheduling', () => {
    it('manages job lifecycle: deduplication, async execution, and queue drainage', async () => {
      const job1 = vi.fn();
      const job2 = vi.fn();

      // 1. Deduplication (Same epoch)
      scheduler.schedule(job1);
      scheduler.schedule(job1);
      scheduler.schedule(job2);

      expect(scheduler.queueSize).toBe(2);
      expect(job1).not.toHaveBeenCalled();

      // 2. Async Execution
      await sleep(10);

      expect(job1).toHaveBeenCalledTimes(1);
      expect(job2).toHaveBeenCalledTimes(1);
      expect(scheduler.queueSize).toBe(0);
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
  });

  describe('Batching Strategy', () => {
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
        expect(c.value).toBe(2); // Computed should be fresh within batch
        a.value = 10;
        return 'done';
      });

      expect(result).toBe('done');
      expect(log).toEqual([10]); // Effect runs only once after batch
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

      expect(a.value).toBe(42); // Value committed despite error
      expect(scheduler.isBatching).toBe(false); // Depth reset correctly
      consoleError.mockRestore();
    });

    it('prevents stack overflow through flat execution loops', () => {
      // Stress test for recursion protection
      const depth = 500;
      const fn = (d: number) => {
        if (d > 0) batch(() => fn(d - 1));
      };

      expect(() => fn(depth)).not.toThrow();
    });
  });

  describe('aeNextTick', () => {
    it('should wait for all reactive updates to be flushed', async () => {
      const a = atom(0);
      let capturedValue = -1;
      effect(() => {
        capturedValue = a.value;
      });

      a.value = 42;
      expect(capturedValue).toBe(0); // Queued

      await aeNextTick();
      expect(capturedValue).toBe(42); // Flushed
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

  describe('Resilience & Safety', () => {
    it('isolates job errors to prevent scheduler lockup', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fail = vi.fn(() => {
        throw new Error('isolated-fail');
      });
      const success = vi.fn();

      scheduler.schedule(fail);
      scheduler.schedule(success);

      await sleep(10);

      expect(fail).toHaveBeenCalled();
      expect(success).toHaveBeenCalled(); // Success job must run despite failure in sibling
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('detects and halts infinite loops (overflow protection)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onOverflow = vi.fn();
      scheduler.onOverflow = onOverflow;

      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      scheduler.setMaxFlushIterations(10);

      const loop = () => scheduler.schedule(loop);
      scheduler.schedule(loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));
      expect(scheduler.queueSize).toBe(0); // Queues must be purged

      scheduler.onOverflow = null;
      scheduler.setMaxFlushIterations(originalMax);
      consoleError.mockRestore();
    });

    it('validates configuration and inputs', () => {
      expect(() => scheduler.schedule(null as unknown as () => void)).toThrow(SchedulerError);
      expect(() => scheduler.setMaxFlushIterations(0)).toThrow();

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      scheduler.endBatch(); // Unbalanced call
      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });
  });
});
