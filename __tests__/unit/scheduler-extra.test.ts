import { describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '../../src/errors/errors';
import { scheduler } from '../../src/scheduler/scheduler';

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
    const originalMax = (scheduler as any).maxFlushIterations;
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
        message: expect.stringContaining('Error occurred during batch execution'),
      })
    );

    consoleError.mockRestore();
  });

  it('rejects invalid maxFlushIterations', () => {
    expect(() => scheduler.setMaxFlushIterations(5)).toThrow(SchedulerError);
  });
});
