import { describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '@/errors/errors';
import { scheduler } from '@/internal/scheduler';

describe('Scheduler - Extra Coverage', () => {
  it('prevents infinite loops with maxFlushIterations', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create a circular dependency
    const job = () => {
      scheduler.schedule(job);
    };

    scheduler.startBatch();
    scheduler.schedule(job);

    // Temporarily set a low limit for testing
    const originalMax = (scheduler as unknown as { maxFlushIterations: number }).maxFlushIterations;
    scheduler.setMaxFlushIterations(10);

    scheduler.endBatch(); // This should trigger the iteration limit

    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Maximum flush iterations'),
      })
    );

    scheduler.setMaxFlushIterations(originalMax);
    consoleError.mockRestore();
  });

  it('handles errors during batch execution', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorJob = () => {
      throw new Error('Batch job fail');
    };

    scheduler.startBatch();
    scheduler.schedule(errorJob);
    scheduler.endBatch();

    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Error occurred during scheduler execution'),
      })
    );

    consoleError.mockRestore();
  });

  it('rejects invalid maxFlushIterations', () => {
    expect(() => scheduler.setMaxFlushIterations(5)).toThrow(SchedulerError);
  });

  it('re-schedules when new jobs arrive during _runLoop finally block', async () => {
    // This covers line 112-113: _size > 0 && !_isBatching after _isProcessing = false
    const callback2 = vi.fn();
    const callback1 = vi.fn(() => {
      // During execution, schedule a new job into the swapped buffer
      scheduler.schedule(callback2);
    });

    scheduler.schedule(callback1);

    // Wait for both microtask flushes
    await new Promise((r) => setTimeout(r, 20));

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('shrinks batch queue when it exceeds SHRINK_THRESHOLD', () => {
    // Fill batch queue beyond BATCH_QUEUE_SHRINK_THRESHOLD (1000)
    scheduler.startBatch();

    for (let i = 0; i < 1100; i++) {
      const job = () => {};
      scheduler.schedule(job);
    }

    // Access internal state to verify batch queue was filled
    const internalBatchQueue = (scheduler as unknown as { _batchQueue: unknown[] })._batchQueue;
    expect(internalBatchQueue.length).toBeGreaterThan(0);

    // endBatch triggers _flushSync -> _mergeBatchQueue which should shrink the queue
    scheduler.endBatch();

    // After merge, if bQueue.length > BATCH_QUEUE_SHRINK_THRESHOLD, it gets reset to 0
    expect(internalBatchQueue.length).toBe(0);
  });

  it('calls onOverflow callback and catches errors from it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onOverflowSpy = vi.fn(() => {
      throw new Error('overflow handler error');
    });
    scheduler.onOverflow = onOverflowSpy;

    // Create infinite loop that exceeds maxFlushIterations
    const job = () => {
      scheduler.schedule(job);
    };

    scheduler.startBatch();
    scheduler.schedule(job);
    const originalMax = (scheduler as unknown as { _maxFlushIterations: number })
      ._maxFlushIterations;
    scheduler.setMaxFlushIterations(10);

    scheduler.endBatch();

    // onOverflow should have been called
    expect(onOverflowSpy).toHaveBeenCalledWith(expect.any(Number));
    // Error from onOverflow is silently caught (empty catch block)
    // No additional console.error from the catch

    scheduler.setMaxFlushIterations(originalMax);
    scheduler.onOverflow = null;
    consoleError.mockRestore();
  });

  it('calls onOverflow callback without error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const droppedCounts: number[] = [];
    scheduler.onOverflow = (count) => {
      droppedCounts.push(count);
    };

    const job = () => {
      scheduler.schedule(job);
    };

    scheduler.startBatch();
    scheduler.schedule(job);
    const originalMax = (scheduler as unknown as { _maxFlushIterations: number })
      ._maxFlushIterations;
    scheduler.setMaxFlushIterations(10);

    scheduler.endBatch();

    expect(droppedCounts.length).toBe(1);
    expect(droppedCounts[0]).toBeGreaterThan(0);

    scheduler.setMaxFlushIterations(originalMax);
    scheduler.onOverflow = null;
    consoleError.mockRestore();
  });
});
