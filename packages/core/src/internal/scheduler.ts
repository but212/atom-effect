import { IS_DEV, SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { endFlush, startFlush } from '@/internal/epoch';

export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

export interface SchedulerJob {
  (): void;
  /** Internal: Epoch check to prevent double-scheduling in same cycle */
  _nextEpoch?: number;
}

/**
 * The scheduler is responsible for managing the execution of reactive updates.
 *
 * - **Batching**: Groups updates to prevent layout thrashing.
 * - **Scheduling**: Uses microtasks (Promises) to yield to the browser paint cycle.
 * - **Loop Detection**: Prevents infinite recursion from runaway effects.
 */
export const scheduler = {
  /** Internal: Double buffered queue [active, pending] */
  _queueBuffer: [[], []] as [SchedulerJob[], SchedulerJob[]],
  _bufferIndex: 0,
  _size: 0,

  /** Monotonic counter for deduping jobs */
  _epoch: 0,

  /** State Flags */
  _isProcessing: false,
  _isBatching: false,
  _isFlushingSync: false,

  /** Batching State */
  _batchDepth: 0,
  _batchQueue: [] as SchedulerJob[],
  _batchQueueSize: 0,

  /** Config */
  _maxFlushIterations: SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS as number,

  get phase(): SchedulerPhase {
    if (this._isProcessing || this._isFlushingSync) return SchedulerPhase.FLUSHING;
    if (this._isBatching) return SchedulerPhase.BATCHING;
    return SchedulerPhase.IDLE;
  },

  get queueSize(): number {
    return this._size;
  },

  get isBatching(): boolean {
    return this._isBatching;
  },

  /**
   * Schedules a unit of work.
   * - If batching: Pushes to batch queue.
   * - If processing: Pushes to pending buffer.
   * - If idle: Schedules microtask flush.
   */
  schedule(callback: SchedulerJob): void {
    if (IS_DEV && typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    // De-duplication: If already scheduled for this epoch, skip.
    if (callback._nextEpoch === this._epoch) return;
    callback._nextEpoch = this._epoch;

    if (this._isBatching || this._isFlushingSync) {
      this._batchQueue[this._batchQueueSize++] = callback;
      return;
    }

    // Push to current active buffer
    this._queueBuffer[this._bufferIndex]![this._size++] = callback;

    // Wake up if sleeping
    if (!this._isProcessing) {
      this._flush();
    }
  },

  /**
   * Trigger async processing.
   */
  _flush(): void {
    if (this._isProcessing || this._size === 0) return;
    this._isProcessing = true;

    queueMicrotask(this._runLoop);
  },

  /**
   * The main event loop for the scheduler.
   * Bound to `this` via arrow function for microtask safety.
   */
  _runLoop: () => {
    try {
      if (scheduler._size === 0) return;

      const started = startFlush();
      scheduler._drainQueue();
      if (started) endFlush();
    } finally {
      scheduler._isProcessing = false;
      // If new jobs arrived during flush (and not batching), re-schedule
      if (scheduler._size > 0 && !scheduler._isBatching) {
        scheduler._flush();
      }
    }
  },

  _flushSync(): void {
    this._isFlushingSync = true;
    const started = startFlush();
    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this._isFlushingSync = false;
      if (started) endFlush();
    }
  },

  _mergeBatchQueue(): void {
    if (this._batchQueueSize === 0) return;

    // Increment epoch to invalidate any "already scheduled" checks from previous ticks
    const epoch = ++this._epoch;
    const bQueue = this._batchQueue;
    const targetBuffer = this._queueBuffer[this._bufferIndex]!;
    let currentSize = this._size;

    // Transfer batch to main queue
    for (let i = 0; i < this._batchQueueSize; i++) {
      const job = bQueue[i]!;
      // Re-tag with new epoch so they are processed in this cycle
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
    }

    this._size = currentSize;
    this._batchQueueSize = 0;

    // Shrink batch queue if needed
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
      bQueue.length = 0;
    }
  },

  _drainQueue(): void {
    let iterations = 0;
    // Keep processing as long as there are jobs
    while (this._size > 0) {
      // Circuit breaker
      if (++iterations > this._maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      this._processQueue();
      // If batch updates happened during processing, merge them in now
      this._mergeBatchQueue();
    }
  },

  _processQueue(): void {
    const idx = this._bufferIndex;
    const jobs = this._queueBuffer[idx]!;
    const count = this._size;

    // Swap buffers (Double Buffering)
    this._bufferIndex = idx ^ 1;
    this._size = 0;
    this._epoch++;

    for (let i = 0; i < count; i++) {
      // Execute job
      try {
        jobs[i]!();
      } catch (e) {
        console.error(new SchedulerError('Error occurred during scheduler execution', e as Error));
      }
    }
    // Clear the consumed buffer
    jobs.length = 0;
  },

  _handleFlushOverflow(): void {
    console.error(
      new SchedulerError(
        `Maximum flush iterations (${this._maxFlushIterations}) exceeded. Possible infinite loop.`
      )
    );
    this._size = 0;
    this._queueBuffer[this._bufferIndex]!.length = 0;
    this._batchQueueSize = 0;
  },

  startBatch(): void {
    this._batchDepth++;
    this._isBatching = true;
  },

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn('endBatch() called without matching startBatch(). Ignoring.');
      return;
    }

    if (--this._batchDepth === 0) {
      this._flushSync();
      this._isBatching = false;
    }
  },

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError(
        `Max flush iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    this._maxFlushIterations = max;
  },
};
