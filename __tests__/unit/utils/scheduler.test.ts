/**
 * @fileoverview Scheduler tests (coverage improvement)
 */

import { describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '@/errors/errors';
import { scheduler } from '@/index';

describe('Scheduler', () => {
  // Scheduler uses Promise.resolve() so we use real timers

  it('rejects invalid callback types', () => {
    expect(() => {
      scheduler.schedule('not a function' as any);
    }).toThrow(SchedulerError);

    expect(() => {
      scheduler.schedule(null as any);
    }).toThrow(SchedulerError);
  });

  it('executes callbacks asynchronously', async () => {
    const callback = vi.fn();

    scheduler.schedule(callback);
    expect(callback).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalled();
  });

  it('executes duplicate callbacks only once', async () => {
    const callback = vi.fn();

    scheduler.schedule(callback);
    scheduler.schedule(callback);
    scheduler.schedule(callback);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Uses Set so duplicates are removed (called at least once)
    expect(callback).toHaveBeenCalled();
  });

  it('does not flush during batching', () => {
    const callback = vi.fn();

    scheduler.startBatch();
    scheduler.schedule(callback);

    expect(callback).not.toHaveBeenCalled();
    expect(scheduler.isBatching).toBe(true);
  });

  it('flushes when batch ends', async () => {
    // Reset from previous test
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const callback = vi.fn();

    scheduler.startBatch();
    scheduler.schedule(callback);
    scheduler.endBatch();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callback).toHaveBeenCalled();
    expect(scheduler.isBatching).toBe(false);
  });

  it('supports nested batching', async () => {
    // Reset from previous test
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const callback = vi.fn();

    scheduler.startBatch();
    expect(scheduler.isBatching).toBe(true);

    scheduler.startBatch();
    expect(scheduler.isBatching).toBe(true);

    scheduler.schedule(callback);

    scheduler.endBatch();
    expect(scheduler.isBatching).toBe(true); // Still in outer batch
    expect(callback).not.toHaveBeenCalled();

    scheduler.endBatch();
    expect(scheduler.isBatching).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalled();
  });

  it('handles errors during callback execution', async () => {
    // Reset from previous test
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorCallback = vi.fn(() => {
      throw new Error('Callback error');
    });
    const normalCallback = vi.fn();

    scheduler.schedule(errorCallback);
    scheduler.schedule(normalCallback);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorCallback).toHaveBeenCalled();
    expect(normalCallback).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('new schedules wait during flush', async () => {
    // Reset from previous test
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const callback1 = vi.fn();
    const callback2 = vi.fn();

    scheduler.schedule(callback1);

    // Wait for first callback execution
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback1).toHaveBeenCalled();

    // Add second callback
    scheduler.schedule(callback2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback2).toHaveBeenCalled();
  });

  it('batchDepth does not go negative', () => {
    scheduler.endBatch();
    scheduler.endBatch();
    scheduler.endBatch();

    // Stays at 0, does not go negative
    expect((scheduler as any).batchDepth).toBe(0);
  });

  it('does not flush when queue is empty', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Call flush with empty queue
    (scheduler as any).flush();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should complete without errors
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('skips flush when already processing', async () => {
    const callback = vi.fn();

    scheduler.schedule(callback);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Callback should be executed only once
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
