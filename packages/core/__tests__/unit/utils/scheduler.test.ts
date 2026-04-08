/**
 * @fileoverview Scheduler behavioral tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import {
  currentEpoch,
  currentFlushEpoch,
  endFlush,
  incrementFlushExecutionCount,
  nextEpoch,
  nextVersion,
  resetFlushState,
  runInFlushScope,
  startFlush,
} from '@/core/scheduler';
import { SchedulerError } from '@/errors';
import { atom, batch, computed, effect, scheduler } from '@/index';
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

  it('defers all notifications until the outermost batch completes', async () => {
    const a = atom(0);
    const b = atom(0);
    const results: [number, number][] = [];

    effect(() => {
      results.push([a.value, b.value]);
    });
    results.length = 0;

    batch(() => {
      a.value = 1;
      batch(() => {
        b.value = 2;
        a.value = 3;
      });
      b.value = 4;
    });

    await sleep(10);
    expect(results).toEqual([[3, 4]]);
  });
});

describe('Epoch & Versioning', () => {
  it('generates sequential non-zero epochs within SMI limits', () => {
    const previous = currentEpoch();
    const next = nextEpoch();

    expect(next).not.toBe(previous);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(SMI_MAX);
  });

  it('calculates next version with wrap-around and avoids 0', () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(SMI_MAX)).toBe(1);
  });

  it('manages flush lifecycle and state correctly', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resetFlushState();
    expect(incrementFlushExecutionCount()).toBe(0); // idle

    expect(startFlush()).toBe(true);
    const epochAfterStart = currentFlushEpoch();
    expect(epochAfterStart).toBeGreaterThan(0);

    // Re-entrancy blocked
    expect(startFlush()).toBe(false);
    expect(consoleWarn).toHaveBeenCalled();
    expect(currentFlushEpoch()).toBe(epochAfterStart);

    expect(incrementFlushExecutionCount()).toBe(1);
    expect(incrementFlushExecutionCount()).toBe(2);

    endFlush();
    expect(incrementFlushExecutionCount()).toBe(0);
    expect(startFlush()).toBe(true);

    endFlush();
    consoleWarn.mockRestore();
  });

  it('runInFlushScope ensures endFlush is called even on failure', () => {
    resetFlushState();
    expect(() =>
      runInFlushScope(() => {
        throw new Error('fail');
      })
    ).toThrow('fail');

    expect(startFlush()).toBe(true); // restart allowed
    endFlush();
  });

  it('detects infinite loops in flush execution count', () => {
    resetFlushState();
    startFlush();

    // Use a high number to hit the 10k threshold
    for (let i = 0; i < 10000; i++) {
      incrementFlushExecutionCount();
    }

    expect(() => incrementFlushExecutionCount()).toThrow(/Infinite loop detected/);
    endFlush();
  });
});
