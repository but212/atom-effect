import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { ERROR_MESSAGES, SchedulerError } from '@/errors';

// ── Epoch & Version Management ──────────────────────────────────────────

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

// ── Scheduler ───────────────────────────────────────────────────────────

export interface SchedulerJobObject {
  execute(): void;
  /** Next scheduled epoch */
  _nextEpoch?: number | undefined;
}

export interface SchedulerJobFunction {
  (): void;
  /** Next scheduled epoch */
  _nextEpoch?: number | undefined;
}

export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

/**
 * Scheduler implementation.
 */
class Scheduler {
  /** Queue buffer */
  _queueBuffer: [SchedulerJob[], SchedulerJob[]] = [[], []];
  _bufferIndex = 0;
  _size = 0;

  /** Epoch counter */
  _epoch = 0;

  /** State flags */
  _isProcessing = false;
  _isFlushingSync = false;

  /** Batching state */
  _batchDepth = 0;
  _batchQueue: SchedulerJob[] = [];
  _batchQueueSize = 0;

  /** Config */
  _maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  /** Overflow callback */
  onOverflow: ((droppedCount: number) => void) | null = null;

  /** Bound run loop for microtask */
  private readonly _boundRunLoop = this._runLoop.bind(this);

  get queueSize(): number {
    return this._size;
  }

  get isBatching(): boolean {
    return this._batchDepth > 0;
  }

  /**
   * Schedules job.
   */
  schedule(callback: SchedulerJob): void {
    if (IS_DEV) {
      const isFn = typeof callback === 'function';
      const isObj =
        typeof callback === 'object' &&
        callback !== null &&
        typeof (callback as SchedulerJobObject).execute === 'function';
      if (!isFn && !isObj) {
        throw new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION);
      }
    }

    // Deduplicate job
    const epoch = this._epoch;
    if (callback._nextEpoch === epoch) return;
    callback._nextEpoch = epoch;

    if (this._batchDepth > 0 || this._isFlushingSync) {
      this._batchQueue[this._batchQueueSize++] = callback;
      return;
    }

    // Push to current active buffer
    const idx = this._bufferIndex;
    this._queueBuffer[idx]![this._size++] = callback;

    this._flush();
  }

  /**
   * Triggers flush.
   */
  _flush(): void {
    if (this._isProcessing || this._size === 0) return;
    this._isProcessing = true;

    queueMicrotask(this._boundRunLoop);
  }

  /**
   * Scheduler loop.
   */
  private _runLoop(): void {
    try {
      if (this._size === 0) return;

      const started = startFlush();
      this._drainQueue();
      if (started) endFlush();
    } finally {
      this._isProcessing = false;
      // If new jobs arrived during flush (and not batching), re-schedule
      if (this._size > 0 && this._batchDepth === 0) {
        this._flush();
      }
    }
  }

  _flushSync(): void {
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

  _mergeBatchQueue(): void {
    const queueSize = this._batchQueueSize;
    if (queueSize === 0) return;

    // Increment epoch
    const epoch = this._updateEpoch();
    const bQueue = this._batchQueue;
    const idx = this._bufferIndex;
    const targetBuffer = this._queueBuffer[idx]!;
    let currentSize = this._size;

    // Merge batch
    for (let i = 0; i < queueSize; i++) {
      const job = bQueue[i]!;
      // Retag jobs only if they belong to a different epoch
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
    }

    this._size = currentSize;
    this._batchQueueSize = 0;
    // Release references immediately while keeping array capacity
    bQueue.length = 0;
  }

  _drainQueue(): void {
    let iterations = 0;
    // Process queue
    while (this._size > 0) {
      // Overflow check
      if (++iterations > this._maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      this._processQueue();
      // If batch updates happened during processing, merge them in now
      this._mergeBatchQueue();
    }
  }

  _processQueue(): void {
    const idx = this._bufferIndex;
    const jobs = this._queueBuffer[idx]!;
    const count = this._size;

    // Swap buffers
    this._bufferIndex = idx ^ 1;
    this._size = 0;
    this._updateEpoch();

    // Execute jobs
    for (let i = 0; i < count; i++) {
      const job = jobs[i]!;
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
    // Clear the consumed buffer
    jobs.length = 0;
  }

  private _handleFlushOverflow(): void {
    const droppedCount = this._size + this._batchQueueSize;
    const max = this._maxFlushIterations;

    console.error(new SchedulerError(ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(max, droppedCount)));

    this._size = 0;
    const idx = this._bufferIndex;
    this._queueBuffer[idx]!.length = 0;
    this._batchQueueSize = 0;
    this._batchQueue.length = 0;

    const onOverflow = this.onOverflow;
    if (onOverflow) {
      try {
        onOverflow(droppedCount);
      } catch {}
    }
  }

  startBatch(): void {
    this._batchDepth++;
  }

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this._batchDepth === 0) {
      this._flushSync();
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError(
        `Max flush iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    this._maxFlushIterations = max;
  }

  private _updateEpoch(): number {
    this._epoch = nextVersion(this._epoch);
    return this._epoch;
  }
}

export const scheduler = new Scheduler();

// ── Batch ───────────────────────────────────────────────────────────────

/**
 * Batches updates.
 *
 * @param fn - Batch function.
 * @returns - Result of `fn`.
 */
export function batch<T>(fn: () => T): T {
  if (typeof fn !== 'function') {
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);
  }

  const s = scheduler;
  s.startBatch();
  try {
    return fn();
  } finally {
    s.endBatch();
  }
}
