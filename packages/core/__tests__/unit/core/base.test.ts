import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  scheduler,
  schedulerEndBatch,
  schedulerIsBatching,
  schedulerQueueSize,
  schedulerSchedule,
  schedulerSetMaxFlushIterations,
} from '@/core/base';
import {
  aeNextTick,
  atom,
  batch,
  computed,
  effect,
  SCHEDULER_CONFIG,
  SchedulerError,
  untracked,
} from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Base Engine (Scheduler & Tracking)', () => {
  beforeEach(async () => {
    // Wait for any pending flushes and reset batch depth
    await aeNextTick();
    while (schedulerIsBatching(scheduler)) {
      schedulerEndBatch(scheduler);
    }
  });

  describe('Core Scheduling', () => {
    it('manages job lifecycle: deduplication, async execution, and queue drainage', async () => {
      const job1 = vi.fn();
      const job2 = vi.fn();

      // 1. Deduplication (Same epoch)
      schedulerSchedule(scheduler, job1);
      schedulerSchedule(scheduler, job1);
      schedulerSchedule(scheduler, job2);

      expect(schedulerQueueSize(scheduler)).toBe(2);
      expect(job1).not.toHaveBeenCalled();

      // 2. Async Execution
      await sleep(10);

      expect(job1).toHaveBeenCalledTimes(1);
      expect(job2).toHaveBeenCalledTimes(1);
      expect(schedulerQueueSize(scheduler)).toBe(0);
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
      expect(schedulerIsBatching(scheduler)).toBe(false); // Depth reset correctly
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

      schedulerSchedule(scheduler, fail);
      schedulerSchedule(scheduler, success);

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
      schedulerSetMaxFlushIterations(scheduler, 10);

      const loop = () => schedulerSchedule(scheduler, loop);
      schedulerSchedule(scheduler, loop);

      await sleep(20);

      expect(onOverflow).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.any(SchedulerError));
      expect(schedulerQueueSize(scheduler)).toBe(0); // Queues must be purged

      scheduler.onOverflow = null;
      schedulerSetMaxFlushIterations(scheduler, originalMax);
      consoleError.mockRestore();
    });

    it('validates configuration and inputs', () => {
      expect(() => schedulerSchedule(scheduler, null as unknown as () => void)).toThrow(
        SchedulerError
      );
      expect(() => schedulerSetMaxFlushIterations(scheduler, 0)).toThrow();

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      schedulerEndBatch(scheduler); // Unbalanced call
      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });
  });

  describe('Tracking Context & untracked()', () => {
    it('untracked() suppresses dependency collection while allowing value access', async () => {
      const a = atom(1);
      const b = atom(10);
      let computeCount = 0;

      // Mixed mode: a is tracked, b is untracked
      const c = computed(() => {
        computeCount++;
        return a.value + untracked(() => b.value);
      });

      expect(c.value).toBe(11);

      // 1. Untracked change: must NOT trigger re-computation
      b.value = 20;
      await aeNextTick();
      expect(c.value).toBe(11); // Stale value is expected until 'a' changes
      expect(computeCount).toBe(1);

      // 2. Tracked change: must trigger re-computation and pick up latest untracked value
      a.value = 2;
      await aeNextTick();
      expect(c.value).toBe(22); // 2 + 20
      expect(computeCount).toBe(2);

      // 3. Simple passthrough & error propagation
      expect(untracked(() => 'foo')).toBe('foo');
      expect(() =>
        untracked(() => {
          throw new Error('baz');
        })
      ).toThrow('baz');
    });

    it('does not track dependencies accessed after an await boundary (Sync Limitation)', async () => {
      const a = atom(0);
      let runs = 0;

      // Async computed: tracking only works before the first 'await'
      const c = computed(
        async () => {
          runs++;
          await sleep(10);
          return a.value;
        },
        { defaultValue: -1 }
      );

      c.value; // Trigger first evaluation
      await sleep(30);
      expect(runs).toBe(1);

      // Update 'a': Since 'a.value' was accessed after 'await', 'c' should NOT be subscribed to 'a'
      a.value = 1;
      await aeNextTick();
      await c.value; // Force re-evaluation attempt
      expect(runs).toBe(1); // Should not have re-run
    });
  });

  describe('Subscription Notification Robustness', () => {
    it('ensures subscriber notifications are untracked even when triggered inside a tracking context', async () => {
      const trigger = atom(0, { sync: true });
      const leakSource = atom(0);
      let parentRuns = 0;

      // Subscriber that accesses an external atom
      trigger.subscribe(() => {
        leakSource.value;
      });

      const parent = effect(() => {
        parentRuns++;
        // Triggering a sync update here forces notifications to happen
        // WHILE this effect's tracking context is active.
        trigger.value = parentRuns;
      });

      await aeNextTick();
      expect(parentRuns).toBe(1);

      // Update leakSource: parent must NOT re-run because the subscriber access was untracked
      leakSource.value = 99;
      await aeNextTick();
      expect(parentRuns).toBe(1);

      parent.dispose();
    });
  });
});
