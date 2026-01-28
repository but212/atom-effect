import { IS_DEV, SMI_MAX } from '@/constants';

let collectorEpoch = 0;

/** Increments and returns the next tracking epoch. */
export const nextEpoch = () => {
  collectorEpoch = (collectorEpoch + 1) & SMI_MAX || 1;
  return collectorEpoch;
};
/** Returns the current tracking epoch. */
export const currentEpoch = () => collectorEpoch;

export let flushEpoch = 0;
export let flushExecutionCount = 0;
let isFlushing = false;

/** Starts a new scheduler flush cycle. */
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

/** Increments the global execution count for loop detection. */
export const incrementFlushExecutionCount = () => (isFlushing ? ++flushExecutionCount : 0);

/** Resets all flush-related state. */
export function resetFlushState(): void {
  flushEpoch = flushExecutionCount = 0;
  isFlushing = false;
}
