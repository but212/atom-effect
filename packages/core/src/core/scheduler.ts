import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { ERROR_MESSAGES, SchedulerError } from '@/errors';

// ── Epoch & Version Management ──────────────────────────────────────────

/**
 * The global epoch counter used for job deduplication and state consistency tracking.
 * @internal
 */
let collectorEpoch = 0;

/**
 * Generates the next tracking epoch ID.
 *
 * Logic: The counter wraps around using `SMI_MAX` and reserves 0 to represent
 * an uninitialized or reset state.
 */
export function nextEpoch(): number {
  const next = (collectorEpoch + 1) & SMI_MAX;
  collectorEpoch = next === 0 ? 1 : next;
  return collectorEpoch;
}

/**
 * Returns the current global tracking epoch.
 */
export function currentEpoch(): number {
  return collectorEpoch;
}

/**
 * Increments a version counter within the SMI-safe integer range.
 *
 * Logic: Version 0 is reserved as a 'never updated' marker.
 */
export function nextVersion(v: number): number {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
}

/**
 * The total number of task executions performed in the active flush cycle.
 * @internal
 */
export let flushExecutionCount = 0;
let isFlushing = false;
let _flushEpoch = 0;

/**
 * Returns the epoch ID associated with the current flush cycle.
 * @internal
 */
export function currentFlushEpoch(): number {
  return _flushEpoch;
}

/**
 * Initiates a new flush cycle.
 *
 * @returns true if the cycle was successfully started; false if a flush is already in progress.
 * @internal
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

/**
 * Terminates the current flush cycle.
 * @internal
 */
export function endFlush(): void {
  isFlushing = false;
}

/**
 * Executes a function within a managed flush scope.
 *
 * Logic: This utility ensures that the flush state is properly initialized and
 * finalized around the execution of the provided function.
 */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  const started = startFlush();
  try {
    return fn();
  } finally {
    if (started) endFlush();
  }
}

/**
 * Increments and validates the task execution count within the current flush.
 *
 * Constraint: Throws an error if the execution count exceeds the configured safety
 * limit to prevent infinite reactive loops from hanging the process.
 *
 * @throws {Error} If the execution count exceeds the threshold.
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
 * Resets the global flush state tracking fields.
 * @internal
 */
export function resetFlushState(): void {
  _flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}

// ── Scheduler ───────────────────────────────────────────────────────────

/** Represents a schedulable object with an execute method. */
export interface SchedulerJobObject {
  execute(): void;
  /** Internal tracking for deduplication within a specific epoch. */
  _nextEpoch?: number | undefined;
}

/** Represents a schedulable function. */
export interface SchedulerJobFunction {
  (): void;
  /** Internal tracking for deduplication within a specific epoch. */
  _nextEpoch?: number | undefined;
}

/** Union type representing any valid schedulable task. */
export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

/**
 * The core engine responsible for coordinating task execution cycles.
 *
 * The Scheduler manages the batching and flushing of reactive updates using
 * double-buffering and epoch-based deduplication to ensure a stable and
 * predictable update order with minimal overhead.
 */
class Scheduler {
  // Bookkeeping fields grouped for V8 SMI optimization
  private _bufferIndex = 0;
  private _size = 0;
  private _epoch = 0;
  private _batchDepth = 0;
  private _batchQueueSize = 0;
  private _maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  private _isProcessing = false;
  private _isFlushingSync = false;

  // Optimization: Pre-allocated buffers are used to avoid repeated array allocations and GC pressure.
  private _buffer0: (SchedulerJob | undefined)[] = [];
  private _buffer1: (SchedulerJob | undefined)[] = [];
  /** A temporary queue for jobs scheduled during an active batch or synchronous flush. */
  private _batchQueue: (SchedulerJob | undefined)[] = [];

  /** Optional callback invoked when the scheduler drops jobs due to buffer overflow. */
  onOverflow: ((droppedCount: number) => void) | null = null;

  private readonly _boundRunLoop = this._runLoop.bind(this);

  /** Returns the total number of pending jobs across all queues. */
  get queueSize(): number {
    return this._size + this._batchQueueSize;
  }

  /** Indicates whether the scheduler is currently within a `batch()` scope. */
  get isBatching(): boolean {
    return this._batchDepth > 0;
  }

  /**
   * Registers a job for deferred execution.
   *
   * Logic: Jobs are deduplicated against the current epoch to prevent redundant
   * executions within the same cycle. If a batch is active, jobs are buffered in
   * the `_batchQueue` until the batch completes.
   *
   * @param callback - The task to schedule.
   * @throws {SchedulerError} If the callback is invalid (DEV mode only).
   */
  schedule(callback: SchedulerJob): void {
    if (IS_DEV) {
      if (
        typeof callback !== 'function' &&
        (!callback || typeof (callback as SchedulerJobObject).execute !== 'function')
      ) {
        throw new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION);
      }
    }

    const epoch = this._epoch;
    // Optimization: Deduplicate jobs based on the current execution epoch.
    if (callback._nextEpoch === epoch) return;
    callback._nextEpoch = epoch;

    if (this._batchDepth > 0 || this._isFlushingSync) {
      this._batchQueue[this._batchQueueSize++] = callback;
      return;
    }

    const buffer = this._bufferIndex === 0 ? this._buffer0 : this._buffer1;
    buffer[this._size++] = callback;

    if (!this._isProcessing) {
      this._flush();
    }
  }

  /**
   * Triggers an asynchronous flush cycle using a microtask.
   */
  private _flush(): void {
    if (this._isProcessing || (this._size === 0 && this._batchQueueSize === 0)) return;
    this._isProcessing = true;
    queueMicrotask(this._boundRunLoop);
  }

  private _runLoop(): void {
    try {
      if (this._size === 0 && this._batchQueueSize === 0) return;

      const started = startFlush();
      this._drainQueue();
      if (started) endFlush();
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Performs a synchronous flush of all pending tasks.
   * @internal
   */
  _flushSync(): void {
    if (this._size === 0 && this._batchQueueSize === 0) return;

    const prev = this._isFlushingSync;
    this._isFlushingSync = true;
    const started = startFlush();
    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this._isFlushingSync = prev;
      if (started) endFlush();
    }
  }

  /**
   * Transfers jobs from the batch queue to the primary execution buffer.
   */
  private _mergeBatchQueue(): void {
    const queueSize = this._batchQueueSize;
    if (queueSize === 0) return;

    const epoch = ++this._epoch | 0;
    const bQueue = this._batchQueue;
    const targetBuffer = this._bufferIndex === 0 ? this._buffer0 : this._buffer1;
    let currentSize = this._size;

    for (let i = 0; i < queueSize; i++) {
      const job = bQueue[i]!;
      // Logic: Ensure jobs added during the merge process are not deduplicated prematurely.
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
      bQueue[i] = undefined; // Optimization: Immediate nullification for GC.
    }

    this._size = currentSize;
    this._batchQueueSize = 0;
    // Optimization: Reset the array length if it exceeds the threshold to release memory.
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) bQueue.length = 0;
  }

  /**
   * Continuously drains both the primary buffer and batch queue until empty.
   */
  private _drainQueue(): void {
    let iterations = 0;
    while (this._size > 0 || this._batchQueueSize > 0) {
      // Constraint: Limit the number of flush iterations to prevent infinite cascading updates.
      if (++iterations > this._maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      if (this._batchQueueSize > 0) this._mergeBatchQueue();
      if (this._size > 0) this._processQueue();
    }
  }

  /**
   * Processes the current primary buffer and swaps to the secondary buffer.
   */
  private _processQueue(): void {
    const idx = this._bufferIndex;
    const jobs = idx === 0 ? this._buffer0 : this._buffer1;
    const count = this._size;

    // Logic: Buffer swapping isolates the current execution cycle from new jobs scheduled during processing.
    this._bufferIndex = idx ^ 1;
    this._size = 0;
    this._epoch = (this._epoch + 1) | 0;

    for (let i = 0; i < count; i++) {
      const job = jobs[i]!;
      jobs[i] = undefined; // Optimization: Prevent memory leaks by clearing references.
      try {
        if (typeof job === 'function') {
          job();
        } else {
          job.execute();
        }
      } catch (e) {
        console.error(new SchedulerError('Error occurred during scheduler execution', e as Error));
      }
    }
  }

  private _handleFlushOverflow(): void {
    const droppedCount = this._size + this._batchQueueSize;
    console.error(
      new SchedulerError(
        ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(this._maxFlushIterations, droppedCount)
      )
    );

    this._size = 0;
    this._buffer0.length = 0;
    this._buffer1.length = 0;
    this._batchQueueSize = 0;
    this._batchQueue.length = 0;

    const onOverflow = this.onOverflow;
    if (onOverflow) {
      try {
        onOverflow(droppedCount);
      } catch {
        // Suppress errors in overflow callback.
      }
    }
  }

  /** Starts a batching scope. */
  startBatch(): void {
    this._batchDepth++;
  }

  /** Ends a batching scope and triggers a synchronous flush if at the root. */
  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this._batchDepth === 0) {
      if (!this._isFlushingSync) {
        this._flushSync();
      }
    }
  }

  /** Configures the maximum number of iterations allowed per flush cycle. */
  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError(
        `Max iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    this._maxFlushIterations = max;
  }
}

/** Global scheduler instance. */
export const scheduler = new Scheduler();

/**
 * Coalesces multiple reactive updates into a single atomic flush cycle.
 *
 * When to use:
 * - To perform multiple related atom updates and trigger side effects only once at the end.
 *
 * @param fn - The function containing the updates to be batched.
 * @returns The result of the provided function.
 * @throws {TypeError} If the parameter is not a function.
 *
 * @example
 * ```typescript
 * import { atom, effect, batch } from '@but212/atom-effect';
 *
 * const a = atom(0);
 * const b = atom(0);
 * effect(() => console.log(a.value + b.value));
 *
 * batch(() => {
 *   a.value = 1;
 *   b.value = 2;
 * }); // Logs "3" once instead of intermediate "1".
 * ```
 */
export function batch<T>(fn: () => T): T {
  if (IS_DEV && typeof fn !== 'function') {
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);
  }

  scheduler.startBatch();
  try {
    return fn();
  } finally {
    scheduler.endBatch();
  }
}

let sharedNextTickPromise: Promise<void> | null = null;

/**
 * Returns a Promise that resolves after all scheduled reactive updates have been processed.
 *
 * When to use:
 * - In testing, to wait for asynchronous state propagation and effects to settle.
 * - When execution must be deferred until the reactive system is stable.
 *
 * @param fn - An optional callback to execute after the system settles.
 * @returns A promise that resolves once all pending tasks are completed.
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

  if (sharedNextTickPromise) {
    return sharedNextTickPromise;
  }

  sharedNextTickPromise = new Promise<void>((resolve) => {
    scheduler.schedule(() => {
      sharedNextTickPromise = null;
      resolve();
    });
  });

  return sharedNextTickPromise;
}
