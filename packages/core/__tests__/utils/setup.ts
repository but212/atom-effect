import { afterEach, beforeEach, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { resetTrackingContext, trackingContext } from '@/core/base';
import { aeNextTick, scheduler, schedulerEndBatch, schedulerIsBatching } from '@/core/scheduler';

beforeEach(async () => {
  // Ensure we start with real timers
  vi.useRealTimers();

  // Wait for any pending microtask flushes to complete
  await aeNextTick();

  // Reset tracking context to avoid active tracking leaking across tests
  resetTrackingContext(trackingContext);

  // Terminate any unbalanced batch depths
  while (schedulerIsBatching(scheduler)) {
    schedulerEndBatch(scheduler);
  }

  // Restore max iterations and other properties to defaults
  scheduler.onOverflow = null;
  scheduler.maxFlushIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  scheduler.resetFlushState();
});

afterEach(() => {
  // Restore all mocks to avoid test pollution
  vi.restoreAllMocks();
  // Restore real timers
  vi.useRealTimers();
});
