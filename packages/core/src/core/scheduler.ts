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
import type {
  JobBuffer,
  SchedulerJob,
  SchedulerJobFunction,
  SchedulerJobObject,
  SchedulerState,
} from '@/types';
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
  #sessionActive = false;
  #sessionEpoch = 0;
  #sessionExecutionCount = 0;

  #active: JobBuffer = { items: [], size: 0 };
  #standby: JobBuffer = { items: [], size: 0 };
  #batch: JobBuffer = { items: [], size: 0 };
  #current: JobBuffer = this.#active;

  #onOverflow: ((droppedCount: number) => void) | null = null;

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
  get sessionActive() {
    return this.#sessionActive;
  }
  get sessionEpoch() {
    return this.#sessionEpoch;
  }
  get sessionExecutionCount() {
    return this.#sessionExecutionCount;
  }
  get queueSize() {
    return this.#active.size + this.#batch.size;
  }
  get onOverflow() {
    return this.#onOverflow;
  }
  set maxFlushIterations(v) {
    Result.unwrap(this.#validateFlushIterations(v));
    this.#maxFlushIterations = v;
  }
  #validateFlushIterations(v: number): Result<void, Error> {
    if (!Number.isInteger(v) || v < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS) {
      return Result.err(new SchedulerError('Invalid limit.'));
    }
    return Result.ok(undefined);
  }
  set onOverflow(v) {
    this.#onOverflow = v;
  }

  /**
   * Logic: Batch Integration
   * Moves jobs from the temporary batch queue to the active processing queue.
   */
  #mergeBatchQueue(): void {
    const batch = this.#batch;
    const queueSize = batch.size;
    if (queueSize === 0) return;

    const epoch = this.nextEpoch();
    const bItems = batch.items;
    const active = this.#active;
    const targetItems = active.items;
    let currentSize = active.size;

    for (let i = 0; i < queueSize; i++) {
      const job = bItems[i]!;
      bItems[i] = undefined;

      // Optimization: Avoid redundant re-queuing within the same epoch.
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetItems[currentSize++] = job;
      }
    }

    active.size = currentSize;
    batch.size = 0;

    if (bItems.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
      bItems.length = 0;
    }
  }

  /**
   * Logic: Queue Exhaustion
   * Continues flushing until both active and batch queues are empty.
   *
   * Constraint: Loop Guard
   * Throws an error if the number of iterations exceeds the limit to prevent
   * infinite reactive loops.
   */
  #drainQueue(): void {
    let iterations = 0;
    const max = this.#maxFlushIterations;

    while (this.#active.size > 0 || this.#batch.size > 0) {
      if (++iterations > max) {
        this.#handleFlushOverflow();
        return;
      }

      if (this.#batch.size > 0) {
        this.#mergeBatchQueue();
      }

      if (this.#active.size > 0) {
        this.#processQueue();
      }
    }
  }

  /**
   * Logic: Job Execution
   * Executes all jobs in the active buffer. Swaps buffers at the start
   * to ensure new schedules during execution go into the standby queue.
   */
  #processQueue(): void {
    const active = this.#active;
    const jobs = active.items;
    const count = active.size;

    // Logic: Buffer Swap
    this.#active = this.#standby;
    this.#standby = active;
    this.#active.size = 0;
    if (this.#current === active) this.#current = this.#active;

    this.nextEpoch();
    const fnKind = KIND.Fn;

    for (let i = 0; i < count; i++) {
      const job = jobs[i]!;
      jobs[i] = undefined;

      try {
        if (job._k === fnKind) {
          (job as SchedulerJobFunction)();
        } else {
          const res = (job as SchedulerJobObject).execute() as unknown as Result<unknown, unknown>;
          if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
            console.error(
              new SchedulerError('Error occurred during scheduler execution', {
                cause: res.error,
              })
            );
          }
        }
      } catch (e) {
        console.error(
          new SchedulerError('Error occurred during scheduler execution', { cause: e })
        );
      }
    }
  }

  #handleFlushOverflow(): void {
    const droppedCount = this.#active.size + this.#batch.size;
    console.error(
      new SchedulerError(
        ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(this.#maxFlushIterations, droppedCount)
      )
    );

    this.#active.size = 0;
    this.#active.items.length = 0;
    this.#standby.size = 0;
    this.#standby.items.length = 0;
    this.#batch.size = 0;
    this.#batch.items.length = 0;

    if (this.#onOverflow) {
      try {
        this.#onOverflow(droppedCount);
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
    if (this.#sessionActive) {
      if (IS_DEV) console.warn('startFlush() called during flush - ignored');
      return false;
    }
    this.#sessionActive = true;
    this.#sessionEpoch = this.nextEpoch();
    this.#sessionExecutionCount = 0;
    return true;
  }

  /** @internal - Ends the current flush session. */
  endFlush(): void {
    this.#sessionActive = false;
  }

  /** @internal - Tracks the number of jobs executed in the current cycle. */
  incrementFlushExecutionCount(): Result<number, Error> {
    if (!this.#sessionActive) return Result.ok(0);
    const count = ++this.#sessionExecutionCount;
    if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) return Result.ok(count);

    return Result.err(new Error(`${LOG_PREFIX} Infinite loop detected: limit exceeded.`));
  }

  resetFlushState(): void {
    this.#sessionEpoch = 0;
    this.#sessionExecutionCount = 0;
    this.#sessionActive = false;
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
   * Adds a job to the current active buffer and triggers an asynchronous
   * microtask flush if the system is currently idle.
   */
  schedule(callback: SchedulerJob): Result<void, Error> {
    if (IS_DEV) {
      if (
        typeof callback !== 'function' &&
        (!callback || typeof (callback as SchedulerJobObject).execute !== 'function')
      ) {
        return Result.err(new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION));
      }
    }

    if (callback._nextEpoch === this.#epoch) return Result.ok(undefined);
    callback._nextEpoch = this.#epoch;

    if (callback._k === undefined) {
      callback._k = typeof callback === 'function' ? KIND.Fn : KIND.Obj;
    }

    const target = this.#current;
    target.items[target.size++] = callback;

    if ((this.#state & SCHEDULER_STATE.PROCESSING) === 0) {
      this.#state |= SCHEDULER_STATE.PROCESSING;
      queueMicrotask(() => {
        try {
          if (this.#active.size === 0 && this.#batch.size === 0) return;
          this.flushQueues();
        } catch (e) {
          resetTrackingContext(trackingContext);
          throw e;
        } finally {
          this.#state &= ~SCHEDULER_STATE.PROCESSING;
        }
      });
    }
    return Result.ok(undefined);
  }

  flushSync(): void {
    if (this.#active.size === 0 && this.#batch.size === 0) return;

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
    this.#current = this.#batch;
  }

  endBatch(): void {
    if (this.#batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this.#batchDepth === 0) {
      this.#state &= ~SCHEDULER_STATE.BATCHING;
      this.#current = this.#active;
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
export const schedulerSetMaxFlushIterations = (state: SchedulerState, max: number) => {
  state.maxFlushIterations = max;
};
/** @internal */
export const schedulerIsBatching = (state: SchedulerState) =>
  (state.state & SCHEDULER_STATE.BATCHING) !== 0;
/** @internal */
export const schedulerQueueSize = (state: SchedulerState) => state.queueSize;

/** Returns the next reactive epoch identifier. */
export const nextEpoch = (): number => scheduler.nextEpoch();
export const currentFlushEpoch = (): number => scheduler.sessionEpoch;

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
 * @param fn - Optional callback to execute after the next tick.
 * @returns A promise that resolves when the flush is complete.
 */
export function aeNextTick(fn?: () => void): Promise<void> {
  if (fn) {
    return new Promise<void>((resolve, reject) => {
      scheduler.schedule(() => {
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
    scheduler.schedule(() => {
      sharedNextTickPromise = null;
      resolve();
    });
  });

  return sharedNextTickPromise;
}
