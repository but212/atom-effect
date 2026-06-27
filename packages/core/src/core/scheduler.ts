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

import { Result } from '@but212/atom-effect-utils';
import {
  ERROR_MESSAGES,
  IS_DEV,
  KIND,
  LOG_PREFIX,
  SCHEDULER_CONFIG,
  SCHEDULER_STATE,
} from '@/constants';
import type { JobBuffer, SchedulerJob, SchedulerJobObject, SchedulerState } from '@/types';
import { nextSmi, SchedulerError } from '@/utils';

import { resetTrackingContext, trackingContext } from './base';

/**
 * Role: Central orchestrator for the reactive task lifecycle.
 *
 * Logic: Double Buffering
 * Maintains 'active' and 'standby' queues to allow new jobs to be scheduled
 * safely while the current batch is being processed.
 */
class ReactiveScheduler implements SchedulerState {
  #epoch = 0;
  #state = SCHEDULER_STATE.IDLE;
  #batchDepth = 0;
  #maxFlushIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  #isSessionActive = false;
  #sessionEpoch = 0;
  #sessionExecutionCount = 0;

  #activeJobBuffer: JobBuffer = { items: [], size: 0 };
  #standbyJobBuffer: JobBuffer = { items: [], size: 0 };

  #onOverflowCallback: ((droppedCount: number) => void) | null = null;

  // Standard Getters/Setters for SchedulerState compliance
  get epoch() {
    return this.#epoch;
  }
  get state() {
    return this.#state;
  }
  get batchDepth() {
    return this.#batchDepth;
  }
  get maxFlushIterations() {
    return this.#maxFlushIterations;
  }
  get isSessionActive() {
    return this.#isSessionActive;
  }
  get sessionEpoch() {
    return this.#sessionEpoch;
  }
  get sessionExecutionCount() {
    return this.#sessionExecutionCount;
  }
  get queueSize() {
    return this.#activeJobBuffer.size;
  }
  get onOverflow() {
    return this.#onOverflowCallback;
  }
  set maxFlushIterations(iterationsLimit) {
    Result.unwrap(this.#validateFlushIterations(iterationsLimit));
    this.#maxFlushIterations = iterationsLimit;
  }
  #validateFlushIterations(iterationsLimit: number): Result<void, Error> {
    if (
      !Number.isInteger(iterationsLimit) ||
      iterationsLimit < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS
    ) {
      return Result.err(new SchedulerError('Invalid limit.'));
    }
    return Result.ok(undefined);
  }
  set onOverflow(callback) {
    this.#onOverflowCallback = callback;
  }

  /**
   * Logic: Queue Exhaustion
   * Continues flushing until active queue is empty.
   *
   * Constraint: Loop Guard
   * Throws an error if the number of iterations exceeds the limit to prevent
   * infinite reactive loops.
   */
  #drainQueue(): void {
    let flushIterationCount = 0;
    const maxFlushIterationsLimit = this.#maxFlushIterations;

    while (this.#activeJobBuffer.size > 0) {
      if (++flushIterationCount > maxFlushIterationsLimit) {
        this.#handleFlushOverflow();
        return;
      }

      this.#processQueue();
    }
  }

  /**
   * Logic: Job Execution
   * Executes all jobs in the active buffer. Swaps buffers at the start
   * to ensure new schedules during execution go into the standby queue.
   */
  #processQueue(): void {
    const activeJobBuffer = this.#activeJobBuffer;
    const activeJobs = activeJobBuffer.items;
    const activeJobsCount = activeJobBuffer.size;

    // Logic: Buffer Swap
    this.#activeJobBuffer = this.#standbyJobBuffer;
    this.#standbyJobBuffer = activeJobBuffer;
    this.#activeJobBuffer.size = 0;

    this.nextEpoch();
    const functionKind = KIND.Fn;

    for (let i = 0; i < activeJobsCount; i++) {
      const job = activeJobs[i];
      if (job === undefined) continue;
      activeJobs[i] = undefined;

      try {
        if (job._kind === functionKind) {
          job();
        } else {
          const executionResult = (job as SchedulerJobObject).execute() as Result<
            void,
            Error
          > | void;
          if (executionResult !== undefined && Result.isErr(executionResult)) {
            const executionError = executionResult.error;
            console.error(
              new SchedulerError(
                `Error occurred during scheduler execution: ${executionError?.message || String(executionError)}`,
                {
                  cause: executionError,
                }
              )
            );
          }
        }
      } catch (unknownError) {
        console.error(
          new SchedulerError(
            `Error occurred during scheduler execution: ${unknownError instanceof Error ? unknownError.message : String(unknownError)}`,
            { cause: unknownError }
          )
        );
      }
    }
  }

  #handleFlushOverflow(): void {
    const droppedCount = this.#activeJobBuffer.size;
    console.error(
      new SchedulerError(
        ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(this.#maxFlushIterations, droppedCount)
      )
    );

    this.#activeJobBuffer.size = 0;
    this.#activeJobBuffer.items.length = 0;
    this.#standbyJobBuffer.size = 0;
    this.#standbyJobBuffer.items.length = 0;

    if (this.#onOverflowCallback) {
      try {
        this.#onOverflowCallback(droppedCount);
      } catch {
        /* Suppress */
      }
    }
  }

  nextEpoch(): number {
    this.#epoch = nextSmi(this.#epoch);
    return this.#epoch;
  }

  /** @internal - Starts a new flush session. */
  startFlush(): boolean {
    if (this.#isSessionActive) {
      if (IS_DEV) console.warn('startFlush() called during flush - ignored');
      return false;
    }
    this.#isSessionActive = true;
    this.#sessionEpoch = this.nextEpoch();
    this.#sessionExecutionCount = 0;
    return true;
  }

  /** @internal - Ends the current flush session. */
  endFlush(): void {
    this.#isSessionActive = false;
  }

  /** @internal - Tracks the number of jobs executed in the current cycle. */
  incrementFlushExecutionCount(): Result<number, Error> {
    if (!this.#isSessionActive) return Result.ok(0);
    const count = ++this.#sessionExecutionCount;
    if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) return Result.ok(count);

    return Result.err(new Error(`${LOG_PREFIX} Infinite loop detected: limit exceeded.`));
  }

  resetFlushState(): void {
    this.#sessionEpoch = 0;
    this.#sessionExecutionCount = 0;
    this.#isSessionActive = false;
  }

  flushQueues(): void {
    const started = this.startFlush();
    try {
      this.#drainQueue();
    } finally {
      if (started) this.endFlush();
    }
  }

  /**
   * Logic: Job Scheduling
   * Adds a job to the active buffer and triggers an asynchronous
   * microtask flush if the system is currently idle.
   */
  schedule(schedulerJob: SchedulerJob): Result<void, Error> {
    if (IS_DEV) {
      if (
        typeof schedulerJob !== 'function' &&
        (!schedulerJob || typeof schedulerJob.execute !== 'function')
      ) {
        return Result.err(new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION));
      }
    }

    if (schedulerJob._nextEpoch === this.#epoch) return Result.ok(undefined);
    schedulerJob._nextEpoch = this.#epoch;

    if (schedulerJob._kind === undefined) {
      schedulerJob._kind = typeof schedulerJob === 'function' ? KIND.Fn : KIND.Obj;
    }

    const target = this.#activeJobBuffer;
    target.items[target.size++] = schedulerJob;

    if ((this.#state & SCHEDULER_STATE.PROCESSING) === 0) {
      this.#state |= SCHEDULER_STATE.PROCESSING;
      queueMicrotask(() => {
        try {
          if (this.#activeJobBuffer.size === 0) return;
          this.flushQueues();
        } catch (microtaskError) {
          resetTrackingContext(trackingContext);
          throw microtaskError;
        } finally {
          this.#state &= ~SCHEDULER_STATE.PROCESSING;
        }
      });
    }
    return Result.ok(undefined);
  }

  flushSync(): void {
    if (this.#activeJobBuffer.size === 0) return;

    const prevState = this.#state;
    this.#state |= SCHEDULER_STATE.FLUSHING_SYNC;
    try {
      this.flushQueues();
    } finally {
      this.#state = prevState;
    }
  }

  startBatch(): void {
    this.#batchDepth++;
    this.#state |= SCHEDULER_STATE.BATCHING;
  }

  endBatch(): void {
    if (this.#batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this.#batchDepth === 0) {
      this.#state &= ~SCHEDULER_STATE.BATCHING;
      if ((this.#state & SCHEDULER_STATE.FLUSHING_SYNC) === 0) {
        this.flushSync();
      }
    }
  }
}

/** @internal */
export const scheduler = new ReactiveScheduler();

/** @internal */
export const schedulerSchedule = (state: SchedulerState, callback: SchedulerJob) =>
  Result.unwrap(state.schedule(callback));
/** @internal */
export const schedulerEndBatch = (state: SchedulerState) => state.endBatch();
/** @internal */
export const schedulerSetMaxFlushIterations = (
  state: SchedulerState,
  maxIterationsLimit: number
) => {
  state.maxFlushIterations = maxIterationsLimit;
};
/** @internal */
export const schedulerIsBatching = (state: SchedulerState) =>
  (state.state & SCHEDULER_STATE.BATCHING) !== 0;
/** @internal */
export const schedulerGetQueueSize = (state: SchedulerState) => state.queueSize;

/** Returns the next reactive epoch identifier. */
export const nextEpoch = (): number => scheduler.nextEpoch();
export const getCurrentFlushEpoch = (): number => scheduler.sessionEpoch;

/**
 * Logic: Atomic Update Batching
 * Groups multiple state updates into a single atomic change cycle.
 *
 * When to use:
 * - When performing multiple related updates to different atoms.
 * - To prevent intermediate re-computations or redundant effect executions.
 *
 * @param fn - The function containing multiple state updates.
 * @returns The value returned by the provided function.
 *
 * @example
 * ```typescript
 * import { batch, atom, effect } from '@but212/atom-effect';
 *
 * const firstName = atom('John');
 * const lastName = atom('Doe');
 *
 * effect(() => console.log(`Full name: ${firstName.value} ${lastName.value}`));
 *
 * // Without batch, the effect would run twice.
 * batch(() => {
 *   firstName.value = 'Jane';
 *   lastName.value = 'Smith';
 * }); // Effect runs once here.
 * ```
 */
function validateBatchFunction(fn: unknown): Result<void, Error> {
  if (IS_DEV && typeof fn !== 'function') {
    return Result.err(new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION));
  }
  return Result.ok(undefined);
}

export function batch<T>(fn: () => T): T {
  Result.unwrap(validateBatchFunction(fn));

  scheduler.startBatch();
  try {
    return fn();
  } finally {
    scheduler.endBatch();
  }
}

/** @internal */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  const started = scheduler.startFlush();
  try {
    return fn();
  } finally {
    if (started) scheduler.endFlush();
  }
}

let sharedNextTickPromise: Promise<void> | null = null;

/**
 * Logic: Asynchronous Synchronization
 * Returns a promise that resolves after the next scheduler flush is completed.
 *
 * When to use:
 * - In tests to wait for effects to finish propagating before making assertions.
 * - When manual synchronization with the reactive cycle is required.
 *
 * @param nextTickCallback - Optional callback to execute after the next tick.
 * @returns A promise that resolves when the flush is complete.
 */
export function aeNextTick(nextTickCallback?: () => void): Promise<void> {
  if (nextTickCallback) {
    return new Promise<void>((resolve, reject) => {
      scheduler.schedule(() => {
        try {
          nextTickCallback();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  if (sharedNextTickPromise) return sharedNextTickPromise;

  sharedNextTickPromise = new Promise<void>((resolve) => {
    scheduler.schedule(() => {
      sharedNextTickPromise = null;
      resolve();
    });
  });

  return sharedNextTickPromise;
}
