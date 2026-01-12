import { SchedulerError } from '../../errors/errors';
import { endFlush, startFlush } from '../epoch';

export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

export type SchedulerJob = (() => void) & { _nextEpoch?: number };

/**
 * Scheduler for reactive updates with batching support.
 * Uses epoch-based O(1) deduplication and double buffering.
 */
class Scheduler {
  private queueA: SchedulerJob[] = [];
  private queueB: SchedulerJob[] = [];
  private queue: SchedulerJob[] = this.queueA;
  private queueSize = 0;
  private _epoch = 0;
  private isProcessing: boolean = false;
  public isBatching: boolean = false;
  private batchDepth: number = 0;
  private batchQueue: SchedulerJob[] = [];
  private batchQueueSize = 0;
  private isFlushingSync: boolean = false;
  private maxFlushIterations: number = 1000;

  get phase(): SchedulerPhase {
    if (this.isProcessing || this.isFlushingSync) {
      return SchedulerPhase.FLUSHING;
    }
    if (this.isBatching) {
      return SchedulerPhase.BATCHING;
    }
    return SchedulerPhase.IDLE;
  }

  schedule(callback: SchedulerJob): void {
    if (typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    // O(1) dedup via epoch
    if (callback._nextEpoch === this._epoch) return;
    callback._nextEpoch = this._epoch;

    if (this.isBatching || this.isFlushingSync) {
      this.batchQueue[this.batchQueueSize++] = callback;
    } else {
      this.queue[this.queueSize++] = callback;
      if (!this.isProcessing) {
        this.flush();
      }
    }
  }

  private flush(): void {
    if (this.isProcessing || this.queueSize === 0) return;

    this.isProcessing = true;

    const jobs = this.queue;
    const count = this.queueSize;

    this.queue = this.queue === this.queueA ? this.queueB : this.queueA;
    this.queueSize = 0;
    this._epoch++;

    queueMicrotask(() => {
      const flushStarted = startFlush();

      for (let i = 0; i < count; i++) {
        try {
          jobs[i]?.();
        } catch (error) {
          console.error(
            new SchedulerError('Error occurred during scheduler execution', error as Error)
          );
        }
      }

      jobs.length = 0;
      this.isProcessing = false;

      if (flushStarted) endFlush();

      if (this.queueSize > 0 && !this.isBatching) {
        this.flush();
      }
    });
  }

  private flushSync(): void {
    this.isFlushingSync = true;
    const flushStarted = startFlush();

    try {
      this._epoch++;

      if (this.batchQueueSize > 0) {
        for (let i = 0; i < this.batchQueueSize; i++) {
          const job = this.batchQueue[i]!;
          if (job._nextEpoch !== this._epoch) {
            job._nextEpoch = this._epoch;
            this.queue[this.queueSize++] = job;
          }
        }
        this.batchQueueSize = 0;
      }

      let iterations = 0;

      while (this.queueSize > 0) {
        if (++iterations > this.maxFlushIterations) {
          console.error(
            new SchedulerError(
              `Maximum flush iterations (${this.maxFlushIterations}) exceeded. Possible infinite loop.`
            )
          );
          this.queueSize = 0;
          this.queue.length = 0;
          this.batchQueueSize = 0;
          break;
        }

        const jobs = this.queue;
        const count = this.queueSize;

        this.queue = this.queue === this.queueA ? this.queueB : this.queueA;
        this.queueSize = 0;
        this._epoch++;

        for (let i = 0; i < count; i++) {
          try {
            jobs[i]?.();
          } catch (error) {
            console.error(
              new SchedulerError('Error occurred during batch execution', error as Error)
            );
          }
        }

        jobs.length = 0;

        if (this.batchQueueSize > 0) {
          for (let i = 0; i < this.batchQueueSize; i++) {
            this.queue[this.queueSize++] = this.batchQueue[i]!;
          }
          this.batchQueueSize = 0;
        }
      }
    } finally {
      this.isFlushingSync = false;
      if (flushStarted) endFlush();
    }
  }

  startBatch(): void {
    this.batchDepth++;
    this.isBatching = true;
  }

  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);

    if (this.batchDepth === 0) {
      this.flushSync();
      this.isBatching = false;
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < 10) {
      throw new SchedulerError('Max flush iterations must be at least 10');
    }
    this.maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
