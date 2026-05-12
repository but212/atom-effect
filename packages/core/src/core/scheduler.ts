/**
 * @module ReactiveScheduler
 *
 * Responsibility:
 * Orchestrates the execution of reactive jobs (Effects, Computeds) using
 * a prioritized queuing system. Manages batching cycles and ensures
 * glitch-free propagation through asynchronous microtasks.
 *
 * Design Intent:
 * Implements a double-buffering strategy to allow safe job queuing during
 * execution phases. Utilizes SMI-safe versioning and epoch tracking to minimize
 * V8 de-optimization in high-frequency hot paths.
 */

import {
  ERROR_MESSAGES,
  IS_DEV,
  KIND,
  LOG_PREFIX,
  SCHEDULER_CONFIG,
  SCHEDULER_STATE,
  SMI_MAX,
} from '@/constants';
import type {
  SchedulerJob,
  SchedulerJobFunction,
  SchedulerJobObject,
  SchedulerState,
} from '@/types';
import { SchedulerError } from '@/utils';

import { resetTrackingContext, trackingContext } from './base';

/**
 * Optimization: SMI-safe Arithmetic
 * Wraps integers to stay within V8's 31-bit signed range (SMI).
 *
 * Why:
 * Transitioning from SMIs to HeapNumbers (doubles) triggers significant
 * de-optimization in hot paths such as version checking and epoch comparison.
 * @internal
 */
export const nextSmi = (v: number): number => {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
};

/** @internal */
export function createSchedulerState(): SchedulerState {
  const active = { items: [], size: 0 };
  const standby = { items: [], size: 0 };
  const batch = { items: [], size: 0 };
  return {
    epoch: 0,
    state: SCHEDULER_STATE.IDLE,
    batchDepth: 0,
    maxFlushIterations: SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS,
    sessionActive: false,
    sessionEpoch: 0,
    sessionExecutionCount: 0,
    active,
    standby,
    batch,
    _current: active,
    onOverflow: null,
  };
}

/** @internal */
export const scheduler = createSchedulerState();

// --- Internal Scheduler Logic ---

/**
 * Logic: Batch Consolidation
 * Transfers jobs from the batch buffer to the active execution queue.
 * @internal
 */
export function schedulerMergeBatchQueue(state: SchedulerState, nextEpochFn: () => number): void {
  const batch = state.batch;
  const queueSize = batch.size;
  if (queueSize === 0) return;

  const epoch = nextEpochFn();
  const bItems = batch.items;
  const active = state.active;
  const targetItems = active.items;
  let currentSize = active.size;

  for (let i = 0; i < queueSize; i++) {
    const job = bItems[i]!;
    // Logic: Deduplication via Epoch
    // Prevents redundant scheduling of the same job within the same flush cycle.
    if (job._nextEpoch !== epoch) {
      job._nextEpoch = epoch;
      targetItems[currentSize++] = job;
    }
    bItems[i] = undefined;
  }

  active.size = currentSize;
  batch.size = 0;

  // Optimization: Buffer Management
  // Shrinks the buffer if it grew significantly beyond the configured threshold.
  if (bItems.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
    bItems.length = 0;
  }
}

/**
 * Logic: Queue Drainage
 * Iteratively flushes active and batch buffers until the system stabilizes.
 *
 * Constraint: Infinite Loop Prevention
 * Subject to `maxFlushIterations` to interrupt circular dependency graphs
 * that would otherwise freeze the execution environment.
 * @internal
 */
export function schedulerDrainQueue(
  state: SchedulerState,
  nextEpochFn: () => number,
  processQueue: (state: SchedulerState) => void,
  handleOverflow: (state: SchedulerState) => void
): void {
  let iterations = 0;
  const max = state.maxFlushIterations;

  while (state.active.size > 0 || state.batch.size > 0) {
    if (++iterations > max) {
      handleOverflow(state);
      return;
    }

    if (state.batch.size > 0) {
      schedulerMergeBatchQueue(state, nextEpochFn);
    }

    if (state.active.size > 0) {
      processQueue(state);
    }
  }
}

/**
 * Optimization: Double-Buffering
 * Swaps internal buffers to allow new jobs to be safely queued while
 * the current set is being executed.
 * @internal
 */
export function schedulerProcessQueue(state: SchedulerState, nextEpochFn: () => number): void {
  const active = state.active;
  const jobs = active.items;
  const count = active.size;

  // Logic: Atomic Buffer Swap
  // active becomes standby (cleared), standby becomes active.
  state.active = state.standby;
  state.standby = active;
  state.active.size = 0;
  if (state._current === active) state._current = state.active;

  nextEpochFn();

  for (let i = 0; i < count; i++) {
    const job = jobs[i]!;
    jobs[i] = undefined;

    try {
      if (job._k === KIND.Fn) {
        (job as SchedulerJobFunction)();
      } else if (job._k === KIND.Obj) {
        (job as SchedulerJobObject).execute();
      }
    } catch (e) {
      console.error(new SchedulerError('Error occurred during scheduler execution', e));
    }
  }
}

/** @internal */
export function schedulerFlushQueues(state: SchedulerState): void {
  const started = schedulerStartFlush(state);
  const next = () => schedulerNextEpoch(state);

  try {
    schedulerDrainQueue(
      state,
      next,
      (s) => schedulerProcessQueue(s, next),
      (s) => schedulerHandleFlushOverflow(s)
    );
  } finally {
    if (started) schedulerEndFlush(state);
  }
}

/**
 * Logic: Overflow Recovery
 * Purges all pending jobs and logs a terminal error when an infinite loop
 * is detected during the flush cycle.
 * @internal
 */
export function schedulerHandleFlushOverflow(state: SchedulerState): void {
  const droppedCount = state.active.size + state.batch.size;
  console.error(
    new SchedulerError(
      ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(state.maxFlushIterations, droppedCount)
    )
  );

  state.active.size = 0;
  state.active.items.length = 0;
  state.standby.size = 0;
  state.standby.items.length = 0;
  state.batch.size = 0;
  state.batch.items.length = 0;

  if (state.onOverflow) {
    try {
      state.onOverflow(droppedCount);
    } catch {
      /* Suppress user callback errors */
    }
  }
}

/** @internal */
export function schedulerNextEpoch(state: SchedulerState): number {
  state.epoch = nextSmi(state.epoch);
  return state.epoch;
}

/** @internal */
export function schedulerStartFlush(state: SchedulerState): boolean {
  if (state.sessionActive) {
    if (IS_DEV) console.warn('startFlush() called during flush - ignored');
    return false;
  }
  state.sessionActive = true;
  state.sessionEpoch = schedulerNextEpoch(state);
  state.sessionExecutionCount = 0;
  return true;
}

/** @internal */
export function schedulerEndFlush(state: SchedulerState): void {
  state.sessionActive = false;
}

/** @internal */
export function schedulerIncrementFlushExecutionCount(state: SchedulerState): number {
  if (!state.sessionActive) return 0;
  const count = ++state.sessionExecutionCount;
  if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) return count;

  throw new Error(`${LOG_PREFIX} Infinite loop detected: limit exceeded.`);
}

/** @internal */
export function schedulerResetFlushState(state: SchedulerState): void {
  state.sessionEpoch = 0;
  state.sessionExecutionCount = 0;
  state.sessionActive = false;
}

/**
 * Logic: Job Delivery
 * Entry point for scheduling reactive tasks. Utilizes microtasks for
 * deferred execution by default to allow for update consolidation.
 *
 * @internal
 */
export function schedulerSchedule(state: SchedulerState, callback: SchedulerJob): void {
  if (IS_DEV) {
    if (
      typeof callback !== 'function' &&
      (!callback || typeof (callback as SchedulerJobObject).execute !== 'function')
    ) {
      throw new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION);
    }
  }

  // Logic: Job Deduplication
  // Prevents the same job from being queued multiple times in the same epoch.
  if (callback._nextEpoch === state.epoch) return;
  callback._nextEpoch = state.epoch;

  if (callback._k === undefined) {
    callback._k = typeof callback === 'function' ? KIND.Fn : KIND.Obj;
  }

  const target = state._current;
  target.items[target.size++] = callback;

  if (
    (state.state & SCHEDULER_STATE.IDLE) === 0 &&
    (state.state & SCHEDULER_STATE.PROCESSING) === 0
  ) {
    state.state |= SCHEDULER_STATE.PROCESSING;
    queueMicrotask(() => {
      try {
        if (state.active.size === 0 && state.batch.size === 0) return;
        schedulerFlushQueues(state);
      } catch (e) {
        resetTrackingContext(trackingContext);
        throw e;
      } finally {
        state.state &= ~SCHEDULER_STATE.PROCESSING;
      }
    });
  }
}

/** @internal */
export function schedulerFlushSync(state: SchedulerState): void {
  if (state.active.size === 0 && state.batch.size === 0) return;

  const prevState = state.state;
  state.state |= SCHEDULER_STATE.FLUSHING_SYNC;
  try {
    schedulerFlushQueues(state);
  } finally {
    state.state = prevState;
  }
}

/** @internal */
export function schedulerStartBatch(state: SchedulerState): void {
  state.batchDepth++;
  state.state |= SCHEDULER_STATE.BATCHING;
  state._current = state.batch;
}

/** @internal */
export function schedulerEndBatch(state: SchedulerState): void {
  if (state.batchDepth === 0) {
    if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
    return;
  }

  if (--state.batchDepth === 0) {
    state.state &= ~SCHEDULER_STATE.BATCHING;
    state._current = state.active;
    if ((state.state & SCHEDULER_STATE.FLUSHING_SYNC) === 0) {
      schedulerFlushSync(state);
    }
  }
}

/** @internal */
export function schedulerSetMaxFlushIterations(state: SchedulerState, max: number): void {
  if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS) throw new SchedulerError(`Invalid limit.`);
  state.maxFlushIterations = max;
}

/** @internal */
export function schedulerIsBatching(state: SchedulerState): boolean {
  return (state.state & SCHEDULER_STATE.BATCHING) !== 0;
}

/** @internal */
export function schedulerQueueSize(state: SchedulerState): number {
  return state.active.size + state.batch.size;
}

export const nextEpoch = (): number => schedulerNextEpoch(scheduler);
export const currentEpoch = (): number => scheduler.epoch;
export const currentFlushEpoch = (): number => scheduler.sessionEpoch;
export const startFlush = (): boolean => schedulerStartFlush(scheduler);
export const endFlush = (): void => schedulerEndFlush(scheduler);
export const incrementFlushExecutionCount = (): number =>
  schedulerIncrementFlushExecutionCount(scheduler);
export const resetFlushState = (): void => schedulerResetFlushState(scheduler);

/**
 * Logic: Atomic Update Batching
 * Groups multiple state updates into a single atomic change cycle.
 * Dependent effects and computeds are flushed synchronously after the callback.
 *
 * @param fn - The function containing multiple reactive updates.
 *
 * @example
 * ```typescript
 * import { atom, batch } from '@but212/atom-effect';
 *
 * const a = atom(0);
 * const b = atom(0);
 *
 * batch(() => {
 *   a.value = 1;
 *   b.value = 2;
 * }); // Dependent effects are triggered once here.
 * ```
 */
export function batch<T>(fn: () => T): T {
  if (IS_DEV && typeof fn !== 'function')
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);

  schedulerStartBatch(scheduler);
  try {
    return fn();
  } finally {
    schedulerEndBatch(scheduler);
  }
}

/** @internal */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  const started = startFlush();
  try {
    return fn();
  } finally {
    if (started) endFlush();
  }
}

let sharedNextTickPromise: Promise<void> | null = null;

/**
 * Logic: Asynchronous Synchronization
 * Returns a promise that resolves after the next scheduler flush is completed.
 * primarily used for awaiting side-effects in testing environments.
 *
 * @param fn - Optional callback to execute after the next tick.
 *
 * @example
 * ```typescript
 * import { aeNextTick } from '@but212/atom-effect';
 *
 * atom.value = 100;
 * await aeNextTick(); // Wait for effects to stabilize.
 * ```
 */
export function aeNextTick(fn?: () => void): Promise<void> {
  if (fn) {
    return new Promise<void>((resolve, reject) => {
      schedulerSchedule(scheduler, () => {
        try {
          fn();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  if (sharedNextTickPromise) return sharedNextTickPromise;

  sharedNextTickPromise = new Promise<void>((resolve) => {
    schedulerSchedule(scheduler, () => {
      sharedNextTickPromise = null;
      resolve();
    });
  });

  return sharedNextTickPromise;
}
