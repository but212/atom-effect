/**
 * @fileoverview Scheduler behavioral tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { atom, computed, effect } from '@/core';
import { batch, scheduler } from '@/core/scheduler';
import { SchedulerError } from '@/errors';
import { sleep } from '../../utils/test-helpers';

describe('Scheduler', () => {
  beforeEach(async () => {
    // Reset state
    while (scheduler.isBatching) scheduler.endBatch();
    scheduler.onOverflow = null;
    await sleep(0);
  });

  describe('Core Scheduling & Deduplication', () => {
    it('executes unique jobs once and deduplicates redundant calls (Async & Sync)', async () => {
      const job = vi.fn();

      // 1. Async deduplication
      scheduler.schedule(job);
      scheduler.schedule(job);
      expect(scheduler.queueSize).toBe(1);

      // 2. Batch deduplication (mixed with previous)
      scheduler.startBatch();
      scheduler.schedule(job);
      scheduler.endBatch();

      await sleep(10);
      expect(job).toHaveBeenCalledTimes(1);
    });

    it('handles nested scheduling and re-entrancy correctly', () => {
      const results: string[] = [];
      const inner = vi.fn(() => results.push('inner'));
      const outer = vi.fn(() => {
        results.push('outer-start');
        scheduler.schedule(inner);
        results.push('outer-end');
      });

      scheduler.startBatch();
      scheduler.schedule(outer);
      scheduler.endBatch();

      expect(results).toEqual(['outer-start', 'outer-end', 'inner']);
    });

    it('executes jobs added during sync flush in the same cycle', () => {
      const second = vi.fn();
      const first = vi.fn(() => scheduler.schedule(second));

      scheduler.startBatch();
      scheduler.schedule(first);
      scheduler.endBatch();

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Resilience & Safety', () => {
    it('isolates job errors and continues processing', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const success = vi.fn();
      const fail = () => {
        throw new Error('fail');
      };

      scheduler.schedule(fail);
      scheduler.schedule(success);

      await sleep(10);
      expect(success).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('protects against infinite loops and cleans up state on overflow', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onOverflow = vi.fn();
      scheduler.onOverflow = onOverflow;

      const originalMax = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
      const minIterations = SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS;
      scheduler.setMaxFlushIterations(minIterations);

      const loop = () => scheduler.schedule(loop);
      scheduler.schedule(loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));

      // Verify internal state cleanup (Indirectly via queueSize)
      expect(scheduler.queueSize).toBe(0);
      // Also check private fields for memory leak prevention (regression test)
      expect((scheduler as unknown as { _batchQueue: unknown[] })._batchQueue.length).toBe(0);

      scheduler.setMaxFlushIterations(originalMax);
      consoleError.mockRestore();
    });
  });

  describe('Configuration & Batching Edge Cases', () => {
    it('warns on unbalanced endBatch calls', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      scheduler.endBatch();
      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });

    it('validates input types and configuration ranges', () => {
      expect(() => scheduler.schedule(null as unknown as () => void)).toThrow(SchedulerError);
      expect(() => scheduler.setMaxFlushIterations(1)).toThrow(SchedulerError);
    });

    it('maintains consistency during nested sync flushes', () => {
      const results: string[] = [];

      scheduler.startBatch();
      scheduler.schedule(() => {
        results.push('outer');
        // Nested batch
        scheduler.startBatch();
        scheduler.schedule(() => results.push('inner'));
        scheduler.endBatch();
      });
      scheduler.endBatch();

      expect(results).toEqual(['outer', 'inner']);
      // Verify sync state restored (Behaviorally: new schedule after this should be async)
      const after = vi.fn();
      scheduler.schedule(after);
      expect(after).not.toHaveBeenCalled();
    });
  });
});

describe('batch()', () => {
  it('coalesces updates and passes return value through', () => {
    const a = atom(0);
    const log: number[] = [];
    a.subscribe((v) => v !== undefined && log.push(v));

    const result = batch(() => {
      a.value = 1;
      a.value = 2;
      batch(() => {
        a.value = 3;
      });
      return 'done';
    });

    expect(result).toBe('done');
    expect(log).toEqual([3]);
  });

  it('propagates errors and validates input', () => {
    expect(() => batch(null as unknown as () => void)).toThrow();
    expect(() =>
      batch(() => {
        throw new Error('Fail');
      })
    ).toThrow('Fail');
  });

  it('computed reads are fresh within a batch', () => {
    const a = atom(0);
    const c = computed(() => a.value + 1);

    batch(() => {
      a.value = 10;
      expect(c.value).toBe(11);
    });

    expect(c.value).toBe(11);
  });

  it('effect triggered by batch runs once after batch ends', () => {
    const a = atom(0);
    const b = atom(0);
    const executions: number[] = [];

    effect(() => {
      executions.push(a.value + b.value);
    });

    const initialCount = executions.length;

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    expect(executions.length).toBe(initialCount + 1);
    expect(executions[executions.length - 1]).toBe(30);
  });

  it('commits atom changes even when batch callback throws', () => {
    const a = atom(0);

    try {
      batch(() => {
        a.value = 42;
        throw new Error('mid-batch');
      });
    } catch {
      /* expected */
    }

    expect(a.value).toBe(42);
    expect(scheduler.isBatching).toBe(false);
  });
});
