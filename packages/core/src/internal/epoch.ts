import { IS_DEV, SMI_MAX } from '@/constants';

// Global epoch counter.
let collectorEpoch = 0;

/**
 * Next tracking epoch.
 */
export const nextEpoch = () => {
  collectorEpoch = (collectorEpoch + 1) & SMI_MAX || 1;
  return collectorEpoch;
};

/** Current tracking epoch. */
export const currentEpoch = () => collectorEpoch;

export let flushEpoch = 0;
export let flushExecutionCount = 0;
let isFlushing = false;

/**
 * Starts flush cycle.
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

/** Ends flush cycle. */
export const endFlush = () => {
  isFlushing = false;
};

/**
 * Increments execution count.
 */
export const incrementFlushExecutionCount = () => (isFlushing ? ++flushExecutionCount : 0);

/**
 * Resets flush state.
 */
export function resetFlushState(): void {
  flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
