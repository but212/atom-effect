import { afterEach, beforeEach, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { trackingContext } from '@/core/base';
import { aeNextTick, scheduler } from '@/core/scheduler';

beforeEach(async () => {
  // Ensure we start with real timers
  vi.useRealTimers();

  // Wait for any pending microtask flushes to complete
  await aeNextTick();

  // Reset tracking context to avoid active tracking leaking across tests
  trackingContext.current = null;

  // Terminate any unbalanced batch depths
  while (scheduler.isBatching) {
    scheduler.endBatch();
  }

  // Restore max iterations and other properties to defaults
  scheduler.onOverflow = null;
  scheduler.maxFlushIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  scheduler.endFlush();
});

afterEach(() => {
  // Restore all mocks to avoid test pollution
  vi.restoreAllMocks();
  // Restore real timers
  vi.useRealTimers();
});
