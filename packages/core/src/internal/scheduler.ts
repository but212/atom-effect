import { IS_DEV, SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { endFlush, startFlush } from '@/internal/epoch';

export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

export interface SchedulerJobObject {
  execute(): void;
  /** Next scheduled epoch */
  _nextEpoch?: number;
}

export interface SchedulerJobFunction {
  (): void;
  /** Next scheduled epoch */
  _nextEpoch?: number;
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
  _isBatching = false;
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

  get phase(): SchedulerPhase {
    if (this._isProcessing || this._isFlushingSync) return SchedulerPhase.FLUSHING;
    if (this._isBatching) return SchedulerPhase.BATCHING;
    return SchedulerPhase.IDLE;
  }

  get queueSize(): number {
    return this._size;
  }

  get isBatching(): boolean {
    return this._isBatching;
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
      if (this._size > 0 && !this._isBatching) {
        this._flush();
      }
    }
  }

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
  }

  _mergeBatchQueue(): void {
    if (this._batchQueueSize === 0) return;

    // Increment epoch
    const epoch = ++this._epoch;
    const bQueue = this._batchQueue;
    const targetBuffer = this._queueBuffer[this._bufferIndex]!;
    let currentSize = this._size;

    // Merge batch
    bQueue.slice(0, this._batchQueueSize).forEach((job) => {
      // Retag jobs
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
    });

    this._size = currentSize;
    this._batchQueueSize = 0;

    // Resize batch queue
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
      bQueue.length = 0;
    }
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
    this._epoch++;

    // Execute jobs
    for (let i = 0; i < count; i++) {
      try {
        const job = jobs[i]!;
        if (typeof job === 'function') job();
        else job.execute();
      } catch (e) {
        console.error(new SchedulerError('Error occurred during scheduler execution', e as Error));
      }
    }
    // Clear the consumed buffer
    jobs.length = 0;
  }

  private _handleFlushOverflow(): void {
    const droppedCount = this._size + this._batchQueueSize;
    console.error(
      new SchedulerError(
        ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(this._maxFlushIterations, droppedCount)
      )
    );
    this._size = 0;
    this._queueBuffer[this._bufferIndex]!.length = 0;
    this._batchQueueSize = 0;

    if (this.onOverflow) {
      try {
        this.onOverflow(droppedCount);
      } catch {}
    }
  }

  startBatch(): void {
    this._batchDepth++;
    this._isBatching = true;
  }

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this._batchDepth === 0) {
      this._flushSync();
      this._isBatching = false;
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError(
        `Max flush iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    this._maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
