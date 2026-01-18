import { IS_DEV, SMI_MAX } from '@/constants';

let collectorEpoch = 0;

/**
 * Increments and returns the next tracking epoch.
 * Used for O(1) dependency management and freshness checks.
 */
export function nextEpoch(): number {
  collectorEpoch = (collectorEpoch + 1) & SMI_MAX || 1;
  return collectorEpoch;
}

/** Returns the current tracking epoch. */
export function currentEpoch(): number {
  return collectorEpoch;
}

// === Infinite Loop Detection State ===

export let flushEpoch = 0;
export let flushExecutionCount = 0;
let isFlushing = false;

/**
 * Starts a new scheduler flush cycle.
 * Increments the flush epoch and resets execution counts for loop detection.
 * @returns true if a new flush cycle was started, false if already flushing.
 */
export function startFlush(): boolean {
  if (isFlushing) {
    if (IS_DEV) {
      console.warn(
        'Warning: startFlush() called during flush - ignored to prevent infinite loop detection bypass'
      );
    }
    return false;
  }

  isFlushing = true;
  flushEpoch = (flushEpoch + 1) & SMI_MAX;
  flushExecutionCount = 0;
  return true;
}

/** Ends the current scheduler flush cycle. */
export function endFlush(): void {
  isFlushing = false;
}

/**
 * Increments the global execution count for the current flush cycle.
 * Used to detect global infinite loops.
 * @returns The new execution count.
 */
export function incrementFlushExecutionCount(): number {
  if (!isFlushing) return 0;
  return ++flushExecutionCount;
}

/** Resets all flush-related state. */
export function resetFlushState(): void {
  flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
