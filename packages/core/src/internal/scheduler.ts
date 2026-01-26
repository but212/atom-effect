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
  private _queueBuffer: [SchedulerJob[], SchedulerJob[]];
  private _bufferIndex: number;
  private _size: number;
  private _epoch: number;
  private isProcessing: boolean;
  private _isBatching: boolean;
  private batchDepth: number;
  private batchQueue: SchedulerJob[];
  private batchQueueSize: number;
  private isFlushingSync: boolean;
  private maxFlushIterations: number;

  constructor() {
    this._queueBuffer = [[], []];
    this._bufferIndex = 0;
    this._size = 0;
    this._epoch = 0;
    this.isProcessing = false;
    this._isBatching = false;
    this.batchDepth = 0;
    this.batchQueue = [];
    this.batchQueueSize = 0;
    this.isFlushingSync = false;
    this.maxFlushIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  }

  /**
   * Returns the current operational phase of the scheduler.
   */
  get phase(): SchedulerPhase {
    if (this.isProcessing || this.isFlushingSync) {
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

    if (this._isBatching || this.isFlushingSync) {
      this.batchQueue[this.batchQueueSize++] = callback;
      return;
    }

    this._queueBuffer[this._bufferIndex]![this._size++] = callback;

    if (!this.isProcessing) {
      this.flush();
    }
  }

  /**
   * Schedules a microtask-based flush of the queue.
   * Coalesces multiple schedule calls into a single microtask execution.
   */
  private flush(): void {
    if (this.isProcessing || this._size === 0) return;

    this.isProcessing = true;

    queueMicrotask(() => {
      try {
        if (this._size === 0) return;

        const flushStarted = startFlush();
        this._drainQueue();
        if (flushStarted) endFlush();
      } finally {
        this.isProcessing = false;

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
    this.isFlushingSync = true;
    const flushStarted = startFlush();

    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this.isFlushingSync = false;
      if (flushStarted) endFlush();
    }
  }

  /**
   * Merges jobs from the batching queue into the primary queue.
   * Increments the epoch to ensure deduplication.
   */
  private _mergeBatchQueue(): void {
    const size = this.batchQueueSize;
    if (size === 0) return;

    const epoch = ++this._epoch;
    const queue = this.batchQueue;
    const targetQueue = this._queueBuffer[this._bufferIndex];
    let targetSize = this._size;

    for (let i = 0; i < size; i++) {
      const job = queue[i]!;
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetQueue![targetSize++] = job;
      }
    }

    this._size = targetSize;
    this.batchQueueSize = 0;
    if (queue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) queue.length = 0;
  }

  private _drainQueue(): void {
    let iterations = 0;
    const maxIterations = this.maxFlushIterations;

    while (this._size > 0) {
      if (++iterations > maxIterations) {
        this._handleFlushOverflow();
        return;
      }

      this._processQueue();
      this._mergeBatchQueue();
    }
  }

  private _processQueue(): void {
    const index = this._bufferIndex;
    const jobs = this._queueBuffer[index];
    const count = this._size;

    // Swap to other buffer
    const nextIndex = index ^ 1;
    this._bufferIndex = nextIndex;
    this._size = 0;
    this._epoch++;

    this._processJobs(jobs!, count);
  }

  private _handleFlushOverflow(): void {
    console.error(
      new SchedulerError(
        `Maximum flush iterations (${this.maxFlushIterations}) exceeded. Possible infinite loop.`
      )
    );
    this._size = 0;
    this._queueBuffer[this._bufferIndex]!.length = 0;
    this.batchQueueSize = 0;
  }

  private _processJobs(jobs: SchedulerJob[], count: number): void {
    for (let i = 0; i < count; i++) {
      try {
        jobs[i]!();
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
    this.batchDepth++;
    this._isBatching = true;
  }

  endBatch(): void {
    if (this.batchDepth === 0) {
      if (IS_DEV) {
        console.warn('endBatch() called without matching startBatch(). Ignoring.');
      }
      return;
    }
    this.batchDepth--;

    if (this.batchDepth === 0) {
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
    this.maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
