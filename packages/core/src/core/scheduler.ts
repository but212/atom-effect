import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { ERROR_MESSAGES, SchedulerError } from '@/errors';

// ── Epoch & Version Management ──────────────────────────────────────────

/**
 * Global epoch counter used for job deduplication and tracking state consistency.
 */
let collectorEpoch = 0;

/**
 * Returns the next tracking epoch.
 * Wraps around using SMI_MAX and reserves 0 for uninitialized state.
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
 * Increments a version counter within SMI range.
 * Reservations: Avoids 0 to allow it as a 'never updated' marker.
 */
export function nextVersion(v: number): number {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
}

/** Current number of executions in the active flush cycle. */
export let flushExecutionCount = 0;
let isFlushing = false;
let _flushEpoch = 0;

/** Returns the epoch associated with the current flush cycle. */
export function currentFlushEpoch(): number {
  return _flushEpoch;
}

/**
 * Starts a new flush cycle.
 * @returns true if the cycle was successfully started, false if already flushing.
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

/** Ends the current flush cycle. */
export function endFlush(): void {
  isFlushing = false;
}

/**
 * Runs a function within a managed flush scope.
 * Ensures the flush state is properly incremented and cleaned up.
 *
 * @param fn - The function to execute.
 * @returns The result of the function execution.
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
 * Track total execution count within a flush.
 * Throws if the count exceeds configured safety limits to prevent hung processes.
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

/** Resets all global flush-related states to their defaults. */
export function resetFlushState(): void {
  _flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}

// ── Scheduler ───────────────────────────────────────────────────────────

export interface SchedulerJobObject {
  execute(): void;
  /** Internal tracking for deduplication within the same epoch. */
  _nextEpoch?: number | undefined;
}

/** Represents a job that can be executed by the scheduler via a function interface. */
export interface SchedulerJobFunction {
  (): void;
  /** Internal tracking for deduplication within the same epoch. */
  _nextEpoch?: number | undefined;
}

/** Union type representing any valid schedulable task. */
export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

/**
 * Core Scheduler that manages asynchronous and synchronous task execution.
 *
 * Features:
 * - Double buffering for stable queue processing.
 * - Automatic job deduplication via Epoch tagging.
 * - Nested batching support with automatic coalescence.
 * - Microsecond-level scheduling via queueMicrotask.
 */
class Scheduler {
  // SMI fields grouped at top for V8 layout optimization
  private _bufferIndex = 0;
  private _size = 0;
  private _epoch = 0;
  private _batchDepth = 0;
  private _batchQueueSize = 0;
  private _maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  // Booleans for compact state tracking
  private _isProcessing = false;
  private _isFlushingSync = false;

  // Pre-allocated buffers to avoid tuple access overhead
  private _buffer0: (SchedulerJob | undefined)[] = [];
  private _buffer1: (SchedulerJob | undefined)[] = [];
  /** Temporary holding area for jobs scheduled during an active batch or sync flush. */
  private _batchQueue: (SchedulerJob | undefined)[] = [];

  /** Optional callback fired when the scheduler drops jobs due to overflow. */
  onOverflow: ((droppedCount: number) => void) | null = null;

  private readonly _boundRunLoop = this._runLoop.bind(this);

  /** Returns the total number of pending jobs (active + batched). */
  get queueSize(): number {
    return this._size + this._batchQueueSize;
  }

  /** Returns true if the scheduler is currently within a `batch()` scope. */
  get isBatching(): boolean {
    return this._batchDepth > 0;
  }

  /**
   * Schedules a job for execution.
   * Jobs are deduplicated based on the current epoch.
   *
   * @param callback - The task to be executed.
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
    if (callback._nextEpoch === epoch) return;
    callback._nextEpoch = epoch;

    // If batching or sync flushing, move to batch queue to ensure order and coalescence.
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

  /** Initiates an asynchronous flush via microtask. */
  private _flush(): void {
    if (this._isProcessing || (this._size === 0 && this._batchQueueSize === 0)) return;
    this._isProcessing = true;
    queueMicrotask(this._boundRunLoop);
  }

  /** Internal microtask execution loop. */
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

  /** Internal synchronous flush typically triggered at the end of a batch. */
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
   * Merges the temporal batch queue into the main active buffer.
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
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
      bQueue[i] = undefined; // Immediate GC hint
    }

    this._size = currentSize;
    this._batchQueueSize = 0;
    // Shrink array if it grew significantly
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) bQueue.length = 0;
  }

  /**
   * Continuous loop that drains both main and batch queues.
   */
  private _drainQueue(): void {
    let iterations = 0;
    while (this._size > 0 || this._batchQueueSize > 0) {
      if (++iterations > this._maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      if (this._batchQueueSize > 0) this._mergeBatchQueue();
      if (this._size > 0) this._processQueue();
    }
  }

  /** Executes all jobs currently in the primary buffer and swaps buffers. */
  private _processQueue(): void {
    const idx = this._bufferIndex;
    const jobs = idx === 0 ? this._buffer0 : this._buffer1;
    const count = this._size;

    // Buffer swapping & Epoch bump
    this._bufferIndex = idx ^ 1;
    this._size = 0;
    this._epoch = (this._epoch + 1) | 0;

    for (let i = 0; i < count; i++) {
      const job = jobs[i]!;
      jobs[i] = undefined; // Avoid memory leaks
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

  /** Resets the scheduler state on infinite loop detection. */
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
      } catch {}
    }
  }

  /** Enters a new batching depth. */
  startBatch(): void {
    this._batchDepth++;
  }

  /** Decrements batching depth. */
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

  /** Configures the maximum safety iterations. */
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
 * Groups multiple state updates into a single batch, delaying effects and computations
 * until the batch is closed.
 *
 * @param fn - The function containing state updates.
 * @returns The result of the function execution.
 * @throws {TypeError} If fn is not a function.
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

/**
 * Returns a promise that resolves after the next scheduler flush.
 * This can be used to wait for all asynchronous effects to be processed.
 *
 * @param fn - Optional callback to execute after the flush.
 * @returns A promise that resolves after the flush completes.
 */
export function aeNextTick(fn?: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    scheduler.schedule(() => {
      try {
        if (fn) fn();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}
