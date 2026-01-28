import { IS_DEV, SMI_MAX } from '@/constants';

// Global epoch counter.
// Monotonically increasing counter used for dirty checking without deeper comparisons.
let collectorEpoch = 0;

/**
 * Increments and returns the next tracking epoch.
 * Handles integer overflow by wrapping around SMI_MAX, but ensures it never hits 0 (reserved).
 */
export const nextEpoch = () => {
  collectorEpoch = (collectorEpoch + 1) & SMI_MAX || 1;
  return collectorEpoch;
};

/** Returns the current tracking epoch. */
export const currentEpoch = () => collectorEpoch;

export let flushEpoch = 0;
export let flushExecutionCount = 0;
let isFlushing = false;

/**
 * Starts a new scheduler flush cycle.
 * Returns true if a new cycle was successfully started (i.e., not already flushing).
 */
export function startFlush(): boolean {
  if (isFlushing) {
    if (IS_DEV) console.warn('startFlush() called during flush - ignored');
    return false;
  }

  isFlushing = true;
  flushEpoch = (flushEpoch + 1) & SMI_MAX || 1;
  flushExecutionCount = 0;
  return true;
}

/** Ends the current scheduler flush cycle. */
export const endFlush = () => {
  isFlushing = false;
};

/**
 * Increments the global execution count for loop detection.
 * Used during `Effect` execution to detect runaway cascades.
 */
export const incrementFlushExecutionCount = () => (isFlushing ? ++flushExecutionCount : 0);

/**
 * Hard reset of the flush state.
 * Strictly primarily for testing state isolation.
 */
export function resetFlushState(): void {
  flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
