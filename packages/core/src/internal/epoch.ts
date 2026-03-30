import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';

// Global epoch counter.
let collectorEpoch = 0;

/**
 * Next tracking epoch.
 */
export const nextEpoch = () => (collectorEpoch = (collectorEpoch + 1) & SMI_MAX || 1);

/** Current tracking epoch. */
export const currentEpoch = () => collectorEpoch;

/** Increments a version counter within SMI range. Avoids 0 to reserve it for uninitialized state. */
export const nextVersion = (v: number) => (v + 1) & SMI_MAX || 1;

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
 * Runs a function within a flush scope.
 * Ensures endFlush() is called even if an error occurs.
 */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  if (!startFlush()) return undefined;
  try {
    return fn();
  } finally {
    endFlush();
  }
}

/**
 * Increments execution count.
 * Throws an error if the count exceeds MAX_EXECUTIONS_PER_FLUSH.
 */
export const incrementFlushExecutionCount = () => {
  if (!isFlushing) return 0;
  const count = ++flushExecutionCount;
  if (count > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
    throw new Error(
      `[atom-effect] Infinite loop detected: flush execution count exceeded ${SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH}`
    );
  }
  return count;
};

/**
 * Resets flush state.
 */
export function resetFlushState(): void {
  _flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
