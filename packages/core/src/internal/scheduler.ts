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
  _nextEpoch?: number;
}

class Scheduler {
  private readonly _queueBuffer: [SchedulerJob[], SchedulerJob[]] = [[], []];
  private _bufferIndex = 0;
  private _size = 0;
  private _epoch = 0;
  private _isProcessing = false;
  private _isBatching = false;
  private _batchDepth = 0;
  private _batchQueue: SchedulerJob[] = [];
  private _batchQueueSize = 0;
  private _isFlushingSync = false;
  private _maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

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

  schedule(callback: SchedulerJob): void {
    if (IS_DEV && typeof callback !== 'function')
      throw new SchedulerError('Scheduler callback must be a function');

    if (callback._nextEpoch === this._epoch) return;
    callback._nextEpoch = this._epoch;

    if (this._isBatching || this._isFlushingSync) {
      this._batchQueue[this._batchQueueSize++] = callback;
      return;
    }

    this._queueBuffer[this._bufferIndex]![this._size++] = callback;

    if (!this._isProcessing) this.flush();
  }

  private flush(): void {
    if (this._isProcessing || this._size === 0) return;
    this._isProcessing = true;

    queueMicrotask(() => {
      try {
        if (this._size === 0) return;
        const started = startFlush();
        this._drainQueue();
        if (started) endFlush();
      } finally {
        this._isProcessing = false;
        if (this._size > 0 && !this._isBatching) this.flush();
      }
    });
  }

  private flushSync(): void {
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

  private _mergeBatchQueue(): void {
    if (this._batchQueueSize === 0) return;

    const epoch = ++this._epoch;
    const bQueue = this._batchQueue;
    const targetBuffer = this._queueBuffer[this._bufferIndex]!;
    let currentSize = this._size;

    for (let i = 0; i < this._batchQueueSize; i++) {
      const job = bQueue[i]!;
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
    }

    this._size = currentSize;
    this._batchQueueSize = 0;
    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) bQueue.length = 0;
  }

  private _drainQueue(): void {
    let iterations = 0;
    while (this._size > 0) {
      if (++iterations > this._maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }
      this._processQueue();
      this._mergeBatchQueue();
    }
  }

  private _processQueue(): void {
    const idx = this._bufferIndex;
    const jobs = this._queueBuffer[idx]!;
    const count = this._size;

    this._bufferIndex = idx ^ 1;
    this._size = 0;
    this._epoch++;

    for (let i = 0; i < count; i++) {
      try {
        jobs[i]!();
      } catch (e) {
        console.error(new SchedulerError('Error occurred during scheduler execution', e as Error));
      }
    }
    jobs.length = 0;
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

  startBatch(): void {
    this._batchDepth++;
    this._isBatching = true;
  }

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn('endBatch() called without matching startBatch(). Ignoring.');
      return;
    }

    if (--this._batchDepth === 0) {
      this.flushSync();
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
