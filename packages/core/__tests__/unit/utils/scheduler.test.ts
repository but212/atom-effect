/**
 * @fileoverview Scheduler tests (coverage improvement)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { SchedulerPhase, scheduler } from '@/internal/scheduler';
import { sleep } from '../../utils/test-helpers';

describe('Scheduler', () => {
  beforeEach(async () => {
    // Reset state
    while (scheduler.isBatching) scheduler.endBatch();
    await sleep(0);
  });

  describe('Queue Execution', () => {
    it('executes unique jobs asynchronously', async () => {
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

    it('re-schedules jobs triggered during flush', async () => {
      const job2 = vi.fn();
      const job1 = vi.fn(() => scheduler.schedule(job2));

      scheduler.schedule(job1);
      await sleep(10);

      expect(job1).toHaveBeenCalled();
      expect(job2).toHaveBeenCalled();
    });
  });

  describe('Batching Strategy', () => {
    it('defers execution until outer batch ends', async () => {
      const job = vi.fn();

      scheduler.startBatch(); // Level 1
      scheduler.startBatch(); // Level 2

      scheduler.schedule(job);
      expect(scheduler.phase).toBe(SchedulerPhase.BATCHING);

      scheduler.endBatch(); // Level 1
      expect(job).not.toHaveBeenCalled(); // Still batching

      scheduler.endBatch(); // Level 0 -> Flush

      // Batch flushing is synchronous
      expect(job).toHaveBeenCalled();
      expect(scheduler.isBatching).toBe(false);
    });

    it('warns on unbalanced endBatch calls', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      scheduler.endBatch(); // No start

      expect(consoleWarn).toHaveBeenCalled();

      // Ensure state remains stable
      expect(scheduler.isBatching).toBe(false);

      consoleWarn.mockRestore();
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

      // Setup low limit
      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      scheduler.setMaxFlushIterations(10);

      // Recursive job
      const loop = () => scheduler.schedule(loop);
      scheduler.schedule(loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));

      // Cleanup
      scheduler.onOverflow = null;
      scheduler.setMaxFlushIterations(originalMax);
      consoleError.mockRestore();
    });
  });
});
