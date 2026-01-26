import { IS_DEV, SCHEDULER_CONFIG, SCHEDULER_STATE_FLAGS } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { endFlush, startFlush } from '@/internal/epoch';

/**
 * Current state of the scheduler.
 */
export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

/**
 * Scheduler job interface.
 */
export interface SchedulerJob {
  (): void;
  _nextEpoch?: number;
}

/**
 * Simplified scheduler optimized for batching and cache locality.
 */
class Scheduler {
  private _activeQueue: SchedulerJob[];
  private _secondaryQueue: SchedulerJob[];
  private _batchQueue: SchedulerJob[];

  private _bufferIndex: number;
  private _size: number;
  private _epoch: number;
  private _flags: number;
  private _batchDepth: number;
  private _batchQueueSize: number;
  private _maxIterations: number;

  constructor() {
    // Hidden Class Stability: Initialize properties in fixed order
    this._activeQueue = [];
    this._secondaryQueue = [];
    this._batchQueue = [];

    this._bufferIndex = 0;
    this._size = 0;
    this._epoch = 0;
    this._flags = 0;
    this._batchDepth = 0;
    this._batchQueueSize = 0;
    this._maxIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  }

  get phase(): SchedulerPhase {
    const flags = this._flags;
    if (flags & (SCHEDULER_STATE_FLAGS.PROCESSING | SCHEDULER_STATE_FLAGS.FLUSHING_SYNC))
      return SchedulerPhase.FLUSHING;
    if (flags & SCHEDULER_STATE_FLAGS.BATCHING) return SchedulerPhase.BATCHING;
    return SchedulerPhase.IDLE;
  }

  get isBatching(): boolean {
    return (this._flags & SCHEDULER_STATE_FLAGS.BATCHING) !== 0;
  }
  get queueSize(): number {
    return this._size;
  }

  /**
   * Schedules a task for execution with O(1) deduplication.
   */
  schedule(callback: SchedulerJob): void {
    if (IS_DEV && typeof callback !== 'function')
      throw new SchedulerError('Callback must be a function');

    const epoch = this._epoch;
    if (callback._nextEpoch === epoch) return;
    callback._nextEpoch = epoch;

    const flags = this._flags;
    if (flags & (SCHEDULER_STATE_FLAGS.BATCHING | SCHEDULER_STATE_FLAGS.FLUSHING_SYNC)) {
      this._batchQueue[this._batchQueueSize++] = callback;
      return;
    }

    // Direct access to active queue for better locality
    const queue = this._bufferIndex === 0 ? this._activeQueue : this._secondaryQueue;
    queue[this._size++] = callback;

    if (!(flags & SCHEDULER_STATE_FLAGS.PROCESSING)) {
      this.flush();
    }
  }

  private flush(): void {
    if (this._flags & SCHEDULER_STATE_FLAGS.PROCESSING || this._size === 0) return;

    this._flags |= SCHEDULER_STATE_FLAGS.PROCESSING;

    queueMicrotask(() => {
      try {
        if (this._size === 0) return;
        const flushStarted = startFlush();
        this._drainQueue();
        if (flushStarted) endFlush();
      } finally {
        this._flags &= ~SCHEDULER_STATE_FLAGS.PROCESSING;
        // Recursive flush if new jobs appeared outside of batching
        if (this._size > 0 && !(this._flags & SCHEDULER_STATE_FLAGS.BATCHING)) this.flush();
      }
    });
  }

  private flushSync(): void {
    this._flags |= SCHEDULER_STATE_FLAGS.FLUSHING_SYNC;
    const flushStarted = startFlush();
    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this._flags &= ~SCHEDULER_STATE_FLAGS.FLUSHING_SYNC;
      if (flushStarted) endFlush();
    }
  }

  private _mergeBatchQueue(): void {
    const size = this._batchQueueSize;
    if (size === 0) return;

    const epoch = ++this._epoch;
    const bQueue = this._batchQueue;
    const target = this._bufferIndex === 0 ? this._activeQueue : this._secondaryQueue;
    let tSize = this._size;

    for (let i = 0; i < size; i++) {
      const job = bQueue[i];
      if (job && job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        target[tSize++] = job;
      }
    }

    this._size = tSize;
    this._batchQueueSize = 0;
    // Fast clear to allow GC to reclaim elements while keeping array capacity
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) bQueue.length = 0;
  }

  private _drainQueue(): void {
    let iterations = 0;
    const max = this._maxIterations;
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
    const jobs = index === 0 ? this._activeQueue : this._secondaryQueue;
    const count = this._size;

    // Buffer Swap & Epoch bump
    this._bufferIndex = index ^ 1;
    this._size = 0;
    this._epoch++;

    for (let i = 0; i < count; i++) {
      try {
        jobs[i]?.();
      } catch (error) {
        console.error(
          new SchedulerError('Error occurred during scheduler execution', error as Error)
        );
      }
    }
    // Release references immediately for memory efficiency
    jobs.length = 0;
  }

  private _handleFlushOverflow(): void {
    console.error(new SchedulerError(`Maximum flush iterations exceeded.`));
    this._size = 0;
    this._activeQueue.length = 0;
    this._secondaryQueue.length = 0;
    this._batchQueueSize = 0;
  }

  startBatch(): void {
    this._batchDepth++;
    this._flags |= SCHEDULER_STATE_FLAGS.BATCHING;
  }

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn('endBatch() called without startBatch()');
      return;
    }
    if (--this._batchDepth === 0) {
      this.flushSync();
      this._flags &= ~SCHEDULER_STATE_FLAGS.BATCHING;
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError('Invalid iteration limit');
    this._maxIterations = max;
  }
}

export const scheduler = new Scheduler();
