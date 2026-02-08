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

/** Increments a version counter within SMI range. */
export const nextVersion = (v: number) => (v + 1) & SMI_MAX;

export let flushExecutionCount = 0;
let isFlushing = false;
let _flushEpoch = 0;

/** Current flush epoch. */
export const currentFlushEpoch = () => _flushEpoch;

/**
 * Starts flush cycle.
 */
export function startFlush(): boolean {
  if (isFlushing) {
    if (IS_DEV) console.warn('startFlush() called during flush - ignored');
    return false;
  }

  isFlushing = true;
  _flushEpoch = nextEpoch();
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
  _flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
