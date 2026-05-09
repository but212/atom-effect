import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { ERROR_MESSAGES, SchedulerError } from '@/errors';
import { resetTrackingContext, trackingContext } from './tracking';

/**
 * Optimization: V8 SMI (Small Integer) optimization.
 * Wraps integers to stay within V8's SMI range (31-bit signed).
 *
 * Reason: Transitioning from SMIs to doubles (HeapNumbers) causes significant
 * de-optimization in hot paths like version checking.
 * @internal
 */
const nextSmi = (v: number): number => {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
};

/**
 * Generates the next version number for stateful objects (Atoms).
 */
export function nextVersion(v: number): number {
  return nextSmi(v);
}

export interface SchedulerJobObject {
  execute(): void;
  /** Internal epoch tracking to prevent redundant scheduling in a single cycle. @internal */
  _nextEpoch?: number | undefined;
}

export interface SchedulerJobFunction {
  (): void;
  /** Internal epoch tracking to prevent redundant scheduling in a single cycle. @internal */
  _nextEpoch?: number | undefined;
}

export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

/**
 * Bitwise state flags for the scheduler state machine.
 */
const S_IDLE = 0;
const S_PROCESSING = 1 << 0;
const S_FLUSHING_SYNC = 1 << 1;
const S_BATCHING = 1 << 2;
const MASK_DEFERRED = S_FLUSHING_SYNC | S_BATCHING;

/**
 * Internal state for the scheduler.
 * @internal
 */
export interface SchedulerState {
  size: number;
  epoch: number;
  batchQueueSize: number;
  state: number;
  batchDepth: number;
  maxFlushIterations: number;
  sessionActive: boolean;
  sessionEpoch: number;
  sessionExecutionCount: number;
  /** Primary queue for the current flush cycle. */
  activeBuffer: (SchedulerJob | undefined)[];
  /** Secondary queue to collect new jobs scheduled during the current flush. */
  standbyBuffer: (SchedulerJob | undefined)[];
  /** Queue for jobs scheduled during a batch session. */
  batchBuffer: (SchedulerJob | undefined)[];
  onOverflow: ((droppedCount: number) => void) | null;
}

/**
 * Factory for scheduler state.
 * @internal
 */
export function createSchedulerState(): SchedulerState {
  return {
    size: 0,
    epoch: 0,
    batchQueueSize: 0,
    state: S_IDLE,
    batchDepth: 0,
    maxFlushIterations: SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS,
    sessionActive: false,
    sessionEpoch: 0,
    sessionExecutionCount: 0,
    activeBuffer: [],
    standbyBuffer: [],
    batchBuffer: [],
    onOverflow: null,
  };
}

/**
 * Logic: Batch Queue Consolidation
 * Moves jobs from the batch buffer to the active execution queue.
 * @internal
 */
export function schedulerMergeBatchQueue(state: SchedulerState, nextEpoch: () => number): void {
  const queueSize = state.batchQueueSize;
  if (queueSize === 0) return;

  const epoch = nextEpoch();
  const bQueue = state.batchBuffer;
  const targetBuffer = state.activeBuffer;
  let currentSize = state.size;

  for (let i = 0; i < queueSize; i++) {
    const job = bQueue[i]!;
    // Logic: Avoid redundant scheduling if the job is already marked for this epoch.
    if (job._nextEpoch !== epoch) {
      job._nextEpoch = epoch;
      targetBuffer[currentSize++] = job;
    }
    bQueue[i] = undefined;
  }

  state.size = currentSize;
  state.batchQueueSize = 0;

  // Optimization: Release memory if the buffer grew significantly.
  if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
    bQueue.length = 0;
  }
}

/**
 * Logic: Recursive Queue Drainage
 * Continuously flushes the queues until no more jobs are pending.
 *
 * Caution: Subject to maxFlushIterations to prevent infinite loops from circular dependencies.
 * @internal
 */
export function schedulerDrainQueue(
  state: SchedulerState,
  nextEpoch: () => number,
  processQueue: (state: SchedulerState) => void,
  handleOverflow: (state: SchedulerState) => void
): void {
  let iterations = 0;
  const max = state.maxFlushIterations;

  while (state.size > 0 || state.batchQueueSize > 0) {
    if (++iterations > max) {
      handleOverflow(state);
      return;
    }

    if (state.batchQueueSize > 0) {
      schedulerMergeBatchQueue(state, nextEpoch);
    }

    if (state.size > 0) {
      processQueue(state);
    }
  }
}

/**
 * Logic: Double-Buffering Job Execution
 * Swaps active/standby buffers to allow safe scheduling during execution.
 * @internal
 */
export function schedulerProcessQueue(state: SchedulerState, nextEpoch: () => number): void {
  const jobs = state.activeBuffer;
  const count = state.size;

  // Logic: Double-buffering swap.
  state.activeBuffer = state.standbyBuffer;
  state.standbyBuffer = jobs;
  state.size = 0;
  nextEpoch();

  for (let i = 0; i < count; i++) {
    const job = jobs[i]!;
    jobs[i] = undefined;

    // Logic: Failure Isolation.
    // Errors in one job should not prevent other jobs from executing.
    try {
      if (typeof job === 'function') job();
      else job.execute();
    } catch (e) {
      console.error(new SchedulerError('Error occurred during scheduler execution', e));
    }
  }
}

/**
 * Logic: Overflow Recovery
 * Cleans up state when the maximum flush iterations are exceeded.
 * @internal
 */
export function schedulerHandleFlushOverflow(state: SchedulerState): void {
  const droppedCount = state.size + state.batchQueueSize;
  console.error(
    new SchedulerError(
      ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(state.maxFlushIterations, droppedCount)
    )
  );

  state.size = 0;
  state.activeBuffer.length = 0;
  state.standbyBuffer.length = 0;
  state.batchQueueSize = 0;
  state.batchBuffer.length = 0;

  if (state.onOverflow) {
    try {
      state.onOverflow(droppedCount);
    } catch {
      /* Suppress callback errors during overflow handling */
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

  throw new Error(
    `[atom-effect] Infinite loop detected: flush execution count exceeded ${SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH}`
  );
}

/** @internal */
export function schedulerResetFlushState(state: SchedulerState): void {
  state.sessionEpoch = 0;
  state.sessionExecutionCount = 0;
  state.sessionActive = false;
}

/**
 * Core scheduling logic. Decisions between microtask or synchronous flush are made here.
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

  // Optimization: Prevents a job from being added to the queue multiple times in the same epoch.
  if (callback._nextEpoch === state.epoch) return;
  callback._nextEpoch = state.epoch;

  // Logic: Queue selection based on current scheduler state.
  if ((state.state & MASK_DEFERRED) === 0) {
    state.activeBuffer[state.size++] = callback;
  } else {
    state.batchBuffer[state.batchQueueSize++] = callback;
  }

  // Logic: Microtask entry point.
  if ((state.state & S_PROCESSING) === 0) {
    state.state |= S_PROCESSING;
    queueMicrotask(() => {
      try {
        if (state.size === 0 && state.batchQueueSize === 0) return;
        const started = schedulerStartFlush(state);
        schedulerDrainQueue(
          state,
          () => schedulerNextEpoch(state),
          (s) => schedulerProcessQueue(s, () => schedulerNextEpoch(s)),
          (s) => schedulerHandleFlushOverflow(s)
        );
        if (started) schedulerEndFlush(state);
      } catch (e) {
        // Caution: Reset tracking context to prevent leaking reactive state after a crash.
        resetTrackingContext(trackingContext);
        throw e;
      } finally {
        state.state &= ~S_PROCESSING;
      }
    });
  }
}

/**
 * Forcefully flushes all pending jobs synchronously.
 * @internal
 */
export function schedulerFlushSync(state: SchedulerState): void {
  if (state.size === 0 && state.batchQueueSize === 0) return;

  const prevState = state.state;
  state.state |= S_FLUSHING_SYNC;
  const started = schedulerStartFlush(state);
  try {
    schedulerMergeBatchQueue(state, () => schedulerNextEpoch(state));
    schedulerDrainQueue(
      state,
      () => schedulerNextEpoch(state),
      (s) => schedulerProcessQueue(s, () => schedulerNextEpoch(s)),
      (s) => schedulerHandleFlushOverflow(s)
    );
  } finally {
    state.state = prevState;
    if (started) schedulerEndFlush(state);
  }
}

/** @internal */
export function schedulerStartBatch(state: SchedulerState): void {
  state.batchDepth++;
  state.state |= S_BATCHING;
}

/** @internal */
export function schedulerEndBatch(state: SchedulerState): void {
  if (state.batchDepth === 0) {
    if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
    return;
  }

  if (--state.batchDepth === 0) {
    state.state &= ~S_BATCHING;
    // Logic: Automatically trigger a sync flush at the end of the outermost batch
    // unless already flushing synchronously.
    if ((state.state & S_FLUSHING_SYNC) === 0) {
      schedulerFlushSync(state);
    }
  }
}

/** @internal */
export function schedulerSetMaxFlushIterations(state: SchedulerState, max: number): void {
  if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
    throw new SchedulerError(
      `Max iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
    );
  state.maxFlushIterations = max;
}

/** @internal */
export function schedulerIsBatching(state: SchedulerState): boolean {
  return (state.state & S_BATCHING) !== 0;
}

/** @internal */
export function schedulerQueueSize(state: SchedulerState): number {
  return state.size + state.batchQueueSize;
}

export const scheduler = createSchedulerState();

export const nextEpoch = (): number => schedulerNextEpoch(scheduler);
export const currentEpoch = (): number => scheduler.epoch;
export const currentFlushEpoch = (): number => scheduler.sessionEpoch;
export const startFlush = (): boolean => schedulerStartFlush(scheduler);
export const endFlush = (): void => schedulerEndFlush(scheduler);
export const incrementFlushExecutionCount = (): number =>
  schedulerIncrementFlushExecutionCount(scheduler);
export const resetFlushState = (): void => schedulerResetFlushState(scheduler);

/**
 * Groups multiple state updates into a single atomic change and flushes them synchronously.
 *
 * When to use:
 * - Ensuring that all effects triggered by state changes are executed immediately before the function returns (Synchronous Settlement).
 * - Creating a transactional scope where multiple updates are treated as one unit and settled predictably.
 *
 * @example
 * ```typescript
 * batch(() => {
 *   atomA.set(1);
 *   atomB.set(2);
 * });
 * // At this point, all triggered effects have already finished executing.
 * ```
 */
export function batch<T>(fn: () => T): T {
  if (IS_DEV && typeof fn !== 'function') {
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);
  }

  schedulerStartBatch(scheduler);
  try {
    return fn();
  } finally {
    schedulerEndBatch(scheduler);
  }
}

/**
 * Scopes a function execution within a flush lifecycle.
 * Ensures the scheduler state is cleaned up even if the provided function throws.
 * @internal
 */
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
 * Returns a promise that resolves after the next scheduler flush.
 *
 * When to use:
 * - Waiting for effects to finish in tests after state updates.
 * - Synchronizing logic with the reactive system's "settled" state.
 *
 * @example
 * ```typescript
 * atom.set(100);
 * await aeNextTick();
 * // DOM or side effects are now guaranteed to be updated.
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
