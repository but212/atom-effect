/**
 * @fileoverview Scheduler tests (coverage improvement)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { scheduler } from '@/core/scheduler';
import { SchedulerError } from '@/errors';
import { sleep } from '../../utils/test-helpers';

describe('Scheduler', () => {
  beforeEach(async () => {
    // Reset state
    while (scheduler.isBatching) scheduler.endBatch();
    await sleep(0);
  });

  describe('Queue Execution', () => {
    it('executes unique jobs asynchronously and deduplicates', async () => {
      const job1 = vi.fn();
      const job2 = vi.fn();

      scheduler.schedule(job1);
      scheduler.schedule(job1); // Duplicate
      scheduler.schedule(job2);

      expect(scheduler.queueSize).toBe(2);
      expect(job1).not.toHaveBeenCalled();

      await sleep(10);

      expect(job1).toHaveBeenCalledTimes(1);
      expect(job2).toHaveBeenCalledTimes(1);
      expect(scheduler.queueSize).toBe(0);
    });
  });

  describe('Batching Strategy', () => {
    it('warns on unbalanced endBatch calls', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      scheduler.endBatch(); // No start

      expect(consoleWarn).toHaveBeenCalled();
      expect(scheduler.isBatching).toBe(false);

      consoleWarn.mockRestore();
    });

    it('deduplicates jobs scheduled within the same batch', () => {
      const job = vi.fn();

      scheduler.startBatch();
      scheduler.schedule(job);
      scheduler.schedule(job); // duplicate within same epoch — must be ignored
      scheduler.endBatch();

      expect(job).toHaveBeenCalledTimes(1);
    });

    it('executes job added during sync flush (schedule inside batch job)', () => {
      const second = vi.fn();
      const first = vi.fn(() => scheduler.schedule(second));

      scheduler.startBatch();
      scheduler.schedule(first);
      scheduler.endBatch(); // triggers _flushSync → first runs → second queued → drained

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Resilience', () => {
    it('isolates errors to specific jobs', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fail = vi.fn(() => {
        throw new Error('Found me');
      });
      const success = vi.fn();

      // 1. Async Queue Error
      scheduler.schedule(fail);
      scheduler.schedule(success);
      await sleep(10);

      expect(fail).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      // 2. Batch Flush Error
      consoleError.mockClear();
      scheduler.startBatch();
      scheduler.schedule(fail);
      scheduler.endBatch(); // Should not throw
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Safety & Configuration', () => {
    it('validates inputs and config', () => {
      expect(() => scheduler.schedule(null as unknown as () => void)).toThrow(SchedulerError);
      expect(() => scheduler.setMaxFlushIterations(1)).toThrow();
    });

    it('protects against infinite loops (overflow)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onOverflow = vi.fn();
      scheduler.onOverflow = onOverflow;

      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      scheduler.setMaxFlushIterations(10);

      const loop = () => scheduler.schedule(loop);
      scheduler.schedule(loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalledWith(expect.any(Number));
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));

      scheduler.onOverflow = null;
      scheduler.setMaxFlushIterations(originalMax);
      consoleError.mockRestore();
    });
  });
});
