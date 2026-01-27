import { IS_DEV, SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { endFlush, startFlush } from '@/internal/epoch';

/**
 * Current state of the scheduler.
 */
export enum SchedulerPhase {
  /** No pending jobs, not currently flushing. */
  IDLE = 0,
  /** Currently within a batch() block. */
  BATCHING = 1,
  /** Currently executing queued jobs. */
  FLUSHING = 2,
}

/**
 * Scheduler job interface.
 */
export interface SchedulerJob {
  (): void;
  /** Epoch for deduplication */
  _nextEpoch?: number;
}

/**
 * Simplified scheduler for reactive updates with double-buffered queue.
 */
class Scheduler {
  private readonly _queueBuffer: [SchedulerJob[], SchedulerJob[]];
  private _bufferIndex: number;
  private _size: number;
  private _epoch: number;
  private _isProcessing: boolean;
  private _isBatching: boolean;
  private _batchDepth: number;
  private _batchQueue: SchedulerJob[];
  private _batchQueueSize: number;
  private _isFlushingSync: boolean;
  private _maxFlushIterations: number;

  constructor() {
    this._queueBuffer = [[], []];
    this._bufferIndex = 0;
    this._size = 0;
    this._epoch = 0;
    this._isProcessing = false;
    this._isBatching = false;
    this._batchDepth = 0;
    this._batchQueue = [];
    this._batchQueueSize = 0;
    this._isFlushingSync = false;
    this._maxFlushIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  }

  /**
   * Returns the current operational phase of the scheduler.
   */
  get phase(): SchedulerPhase {
    if (this._isProcessing || this._isFlushingSync) {
      return SchedulerPhase.FLUSHING;
    }
    if (this._isBatching) {
      return SchedulerPhase.BATCHING;
    }
    return SchedulerPhase.IDLE;
  }

  /** Current number of pending jobs. */
  get queueSize(): number {
    return this._size;
  }

  /**
   * Returns whether the scheduler is currently batching updates.
   */
  get isBatching(): boolean {
    return this._isBatching;
  }

  /**
   * Schedules a task for execution.
   */
  schedule(callback: SchedulerJob): void {
    if (IS_DEV && typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    const epoch = this._epoch;
    if (callback._nextEpoch === epoch) return;
    callback._nextEpoch = epoch;

    if (this._isBatching || this._isFlushingSync) {
      this._batchQueue[this._batchQueueSize++] = callback;
      return;
    }

    const index = this._bufferIndex;
    const size = this._size;
    this._queueBuffer[index]![size] = callback;
    this._size = size + 1;

    if (!this._isProcessing) {
      this.flush();
    }
  }

  /**
   * Schedules a microtask-based flush of the queue.
   * Coalesces multiple schedule calls into a single microtask execution.
   */
  private flush(): void {
    if (this._isProcessing || this._size === 0) return;

    this._isProcessing = true;

    queueMicrotask(() => {
      try {
        if (this._size === 0) return;

        const flushStarted = startFlush();
        this._drainQueue();
        if (flushStarted) endFlush();
      } finally {
        this._isProcessing = false;

        // Recursively trigger next flush if new jobs were added during drainage
        if (this._size > 0 && !this._isBatching) {
          this.flush();
        }
      }
    });
  }

  /**
   * Immediately flushes all queues synchronously.
   * Used at the end of a batch block or when immediate reflection is required.
   */
  private flushSync(): void {
    this._isFlushingSync = true;
    const flushStarted = startFlush();

    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this._isFlushingSync = false;
      if (flushStarted) endFlush();
    }
  }

  /**
   * Merges jobs from the batching queue into the primary queue.
   * Increments the epoch to ensure deduplication.
   */
  private _mergeBatchQueue(): void {
    const size = this._batchQueueSize;
    if (size === 0) return;

    const epoch = ++this._epoch;
    const bQueue = this._batchQueue;
    const targetBuffer = this._queueBuffer[this._bufferIndex]!;
    let targetSize = this._size;

    for (let i = 0; i < size; i++) {
      const job = bQueue[i]!;
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[targetSize++] = job;
      }
    }

    this._size = targetSize;
    this._batchQueueSize = 0;
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
      bQueue.length = 0;
    }
  }

  private _drainQueue(): void {
    let iterations = 0;
    const max = this._maxFlushIterations;

    while (this._size > 0) {
      if (++iterations > max) {
        this._handleFlushOverflow();
        return;
      }

      this._processQueue();
      this._mergeBatchQueue();
    }
  }

  private _processQueue(): void {
    const index = this._bufferIndex;
    const jobs = this._queueBuffer[index]!;
    const count = this._size;

    // Swap to other buffer
    this._bufferIndex = index ^ 1;
    this._size = 0;
    this._epoch++;

    this._processJobs(jobs, count);
  }

  private _handleFlushOverflow(): void {
    console.error(
      new SchedulerError(
        `Maximum flush iterations (${this._maxFlushIterations}) exceeded. Possible infinite loop.`
      )
    );
    this._size = 0;
    this._queueBuffer[this._bufferIndex]!.length = 0;
    this._batchQueueSize = 0;
  }

  private _processJobs(jobs: SchedulerJob[], count: number): void {
    for (let i = 0; i < count; i++) {
      try {
        const job = jobs[i];
        if (job) job();
      } catch (error) {
        console.error(
          new SchedulerError('Error occurred during scheduler execution', error as Error)
        );
      }
    }
    // O(1) clear of the array to release references without re-allocating
    jobs.length = 0;
  }

  startBatch(): void {
    this._batchDepth++;
    this._isBatching = true;
  }

  endBatch(): void {
    const depth = this._batchDepth;
    if (depth === 0) {
      if (IS_DEV) {
        console.warn('endBatch() called without matching startBatch(). Ignoring.');
      }
      return;
    }

    const nextDepth = depth - 1;
    this._batchDepth = nextDepth;

    if (nextDepth === 0) {
      this.flushSync();
      this._isBatching = false;
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS) {
      throw new SchedulerError(
        `Max flush iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    }
    this._maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
