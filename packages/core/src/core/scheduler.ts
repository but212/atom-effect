import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { ERROR_MESSAGES, SchedulerError } from '@/errors';

// ── Epoch & Version Management ──────────────────────────────────────────

/**
 * Global counter for task deduplication. Incremented per flush/batch cycle.
 * @internal
 */
let collectorEpoch = 0;

/**
 * Bitwise wrap-around to keep integers within V8's SMI (Small Integer) range.
 * Reason: Prevents performance drops caused by integer overflow transitioning to doubles.
 */
const nextSmi = (v: number): number => {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
};

/**
 * Advances the global tracking epoch.
 */
export function nextEpoch(): number {
  collectorEpoch = nextSmi(collectorEpoch);
  return collectorEpoch;
}

export function currentEpoch(): number {
  return collectorEpoch;
}

/**
 * Increments version numbers for stateful objects (Atoms).
 */
export function nextVersion(v: number): number {
  return nextSmi(v);
}

/**
 * Tracks the state of an active execution pass.
 * Data-driven approach to lifecycle management instead of scattered boolean flags.
 */
interface FlushContext {
  active: boolean;
  epoch: number;
  executionCount: number;
}

const flushContext: FlushContext = {
  active: false,
  epoch: 0,
  executionCount: 0,
};

/**
 * @internal
 */
export function currentFlushEpoch(): number {
  return flushContext.epoch;
}

/**
 * Locks the scheduler for a new execution pass.
 * Returns false if a flush is already in progress to prevent re-entrancy bugs.
 * @internal
 */
export function startFlush(): boolean {
  if (flushContext.active) {
    if (IS_DEV) console.warn('startFlush() called during flush - ignored');
    return false;
  }

  flushContext.active = true;
  flushContext.epoch = nextEpoch();
  flushContext.executionCount = 0;
  return true;
}

/**
 * Releases the flush lock.
 * @internal
 */
export function endFlush(): void {
  flushContext.active = false;
}

/**
 * Scopes a function execution within a flush lifecycle.
 * Ensures the scheduler state is cleaned up even if the provided function throws.
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
 * Monitors the number of jobs executed in a single flush.
 *
 * Warning: This is the primary defense against infinite reactive loops.
 * If A triggers B, and B triggers A, this counter will hit the limit and
 * stop the execution before the browser UI freezes.
 */
export function incrementFlushExecutionCount(): number {
  if (!flushContext.active) return 0;

  const count = ++flushContext.executionCount;
  if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
    return count;
  }

  throw new Error(
    `[atom-effect] Infinite loop detected: flush execution count exceeded ${SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH}`
  );
}

/**
 * @internal
 */
export function resetFlushState(): void {
  flushContext.epoch = 0;
  flushContext.executionCount = 0;
  flushContext.active = false;
}

// ── Scheduler ───────────────────────────────────────────────────────────

export interface SchedulerJobObject {
  execute(): void;
  /** Internal tracking for deduplication within a specific epoch. */
  _nextEpoch?: number | undefined;
}

export interface SchedulerJobFunction {
  (): void;
  _nextEpoch?: number | undefined;
}

export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

// State flags used for fast bitwise checking of scheduler status.
const S_IDLE = 0;
const S_PROCESSING = 1 << 0; // Currently running the microtask loop.
const S_FLUSHING_SYNC = 1 << 1; // Running a forced synchronous update.
const S_BATCHING = 1 << 2; // Inside a user-defined batch() block.
const MASK_DEFERRED = S_FLUSHING_SYNC | S_BATCHING;

/**
 * Core engine managing the timing and deduplication of reactive updates.
 *
 * Uses a "Double-Buffer + Batch-Buffer" (Triple Buffer) design:
 * 1. Active: Jobs being processed right now.
 * 2. Standby: Jobs scheduled while the current buffer is being processed.
 * 3. Batch: Jobs held until a batching scope finishes.
 */
class Scheduler {
  private _size = 0;
  private _epoch = 0;
  private _batchQueueSize = 0;
  private _state = S_IDLE;
  private _batchDepth = 0;
  private _maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  // Buffer layout: [Active, Standby, Batch]
  private _buffers: (SchedulerJob | undefined)[][] = [[], [], []];
  private _activeIdx = 0;
  private _standbyIdx = 1;
  private _batchIdx = 2;

  /** Callback for telemetry or error handling when the job queue overflows. */
  onOverflow: ((droppedCount: number) => void) | null = null;

  private readonly _boundRunLoop = this._runLoop.bind(this);

  get queueSize(): number {
    return this._size + this._batchQueueSize;
  }

  get isBatching(): boolean {
    return (this._state & S_BATCHING) !== 0;
  }

  /**
   * Adds a task to the queue.
   * Deduplicates automatically if the task was already added in this epoch.
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

    // Optimization: Skip if the job is already slated for the current/next cycle.
    if (callback._nextEpoch === this._epoch) return;
    callback._nextEpoch = this._epoch;

    this._push(callback);

    // If not already processing, schedule a microtask to flush.
    if ((this._state & S_PROCESSING) === 0) {
      this._flush();
    }
  }

  private _push(job: SchedulerJob): void {
    // If we are batching or forcing a sync flush, redirect jobs to the batch buffer.
    const isDeferred = (this._state & MASK_DEFERRED) !== 0;
    if (isDeferred) {
      this._buffers[this._batchIdx]![this._batchQueueSize++] = job;
    } else {
      this._buffers[this._activeIdx]![this._size++] = job;
    }
  }

  /**
   * Schedules a microtask to process the queue.
   */
  private _flush(): void {
    if ((this._state & S_PROCESSING) !== 0 || (this._size === 0 && this._batchQueueSize === 0))
      return;
    this._state |= S_PROCESSING;
    queueMicrotask(this._boundRunLoop);
  }

  private _runLoop(): void {
    try {
      if (this._size === 0 && this._batchQueueSize === 0) return;

      const started = startFlush();
      this._drainQueue();
      if (started) endFlush();
    } finally {
      this._state &= ~S_PROCESSING;
    }
  }

  /**
   * Forces all pending updates to execute immediately.
   * Use this when you need synchronous state consistency (e.g., DOM measurements).
   * @internal
   */
  _flushSync(): void {
    if (this._size === 0 && this._batchQueueSize === 0) return;

    const prevState = this._state;
    this._state |= S_FLUSHING_SYNC;
    const started = startFlush();
    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this._state = prevState;
      if (started) endFlush();
    }
  }

  /**
   * Moves jobs from the batch buffer to the active buffer for processing.
   */
  private _mergeBatchQueue(): void {
    const queueSize = this._batchQueueSize;
    if (queueSize === 0) return;

    // Bump epoch so that newly merged jobs aren't immediately deduplicated
    // if they were added within the same batch.
    this._epoch = nextSmi(this._epoch);
    const epoch = this._epoch;
    const bQueue = this._buffers[this._batchIdx]!;
    const targetBuffer = this._buffers[this._activeIdx]!;
    let currentSize = this._size;

    for (let i = 0; i < queueSize; i++) {
      const job = bQueue[i]!;
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
      bQueue[i] = undefined; // Help GC
    }

    this._size = currentSize;
    this._batchQueueSize = 0;

    // Memory optimization: shrink the array if it grew significantly.
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) bQueue.length = 0;
  }

  /**
   * Iterates until all buffers are empty.
   * Handles "Cascading Updates" (jobs scheduling other jobs).
   */
  private _drainQueue(): void {
    let iterations = 0;

    while (this.queueSize > 0) {
      if (++iterations > this._maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      if (this._batchQueueSize > 0) {
        this._mergeBatchQueue();
      }

      if (this._size > 0) {
        this._processQueue();
      }
    }
  }

  /**
   * Executes the active buffer.
   * Swaps buffers (Standby becomes Active) to avoid array modification during iteration.
   */
  private _processQueue(): void {
    const jobs = this._buffers[this._activeIdx]!;
    const count = this._size;

    // Swap indices: Standby buffer is used for any jobs scheduled during this loop.
    const nextIdx = this._activeIdx;
    this._activeIdx = this._standbyIdx;
    this._standbyIdx = nextIdx;

    this._size = 0;
    this._epoch = nextSmi(this._epoch);

    for (let i = 0; i < count; i++) {
      const job = jobs[i]!;
      jobs[i] = undefined; // Prevent memory leaks (GC optimization)

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

    // Emergency cleanup to prevent permanent lockup.
    this._size = 0;
    this._buffers[this._activeIdx]!.length = 0;
    this._buffers[this._standbyIdx]!.length = 0;
    this._batchQueueSize = 0;
    this._buffers[this._batchIdx]!.length = 0;

    const onOverflow = this.onOverflow;
    if (onOverflow) {
      try {
        onOverflow(droppedCount);
      } catch {
        /* Suppress user callback errors */
      }
    }
  }

  startBatch(): void {
    this._batchDepth++;
    this._state |= S_BATCHING;
  }

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this._batchDepth === 0) {
      this._state &= ~S_BATCHING;
      // Only trigger sync flush if we aren't already inside another sync flush.
      if ((this._state & S_FLUSHING_SYNC) === 0) {
        this._flushSync();
      }
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError(
        `Max iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    this._maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();

/**
 * Groups multiple state updates into a single atomic change.
 * Effects will only trigger once after the provided function finishes.
 *
 * @example
 * ```typescript
 * batch(() => {
 *   atomA.set(1);
 *   atomB.set(2);
 * }); // Effects listening to A or B run once here.
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
 * Returns a promise that resolves after the next scheduler flush.
 * Use this to wait for the reactive system to "settle" in tests or async logic.
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
