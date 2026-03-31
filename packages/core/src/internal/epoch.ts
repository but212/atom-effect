import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';

// Global epoch counter.
let collectorEpoch = 0;

/**
 * Next tracking epoch.
 */
export function nextEpoch(): number {
  const next = (collectorEpoch + 1) & SMI_MAX;
  collectorEpoch = next === 0 ? 1 : next;
  return collectorEpoch;
}

/** Current tracking epoch. */
export function currentEpoch(): number {
  return collectorEpoch;
}

/** Increments a version counter within SMI range. Avoids 0 to reserve it for uninitialized state. */
export function nextVersion(v: number): number {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
}

export let flushExecutionCount = 0;
let isFlushing = false;
let _flushEpoch = 0;

/** Current flush epoch. */
export function currentFlushEpoch(): number {
  return _flushEpoch;
}

/**
 * Starts flush cycle.
 */
export function startFlush(): boolean {
  if (isFlushing) {
    if (IS_DEV) {
      console.warn('startFlush() called during flush - ignored');
    }
    return false;
  }

  isFlushing = true;
  _flushEpoch = nextEpoch();
  flushExecutionCount = 0;
  return true;
}

/** Ends flush cycle. */
export function endFlush(): void {
  isFlushing = false;
}

/**
 * Runs a function within a flush scope.
 * Ensures endFlush() is called even if an error occurs.
 */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  if (!startFlush()) {
    return undefined;
  }

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
export function incrementFlushExecutionCount(): number {
  if (!isFlushing) return 0;

  const count = ++flushExecutionCount;
  if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
    return count;
  }

  throw new Error(
    `[atom-effect] Infinite loop detected: flush execution count exceeded ${SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH}`
  );
}

/**
 * Resets flush state.
 */
export function resetFlushState(): void {
  _flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
