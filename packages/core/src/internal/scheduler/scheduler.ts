import { SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '../../errors/errors';
import { endFlush, startFlush } from '../epoch';

export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

export interface SchedulerJob {
  (): void;
  _nextEpoch?: number;
}

/**
 * Scheduler for reactive updates.
 * Manages the execution of effects and computed updates using batching and double-buffering.
 * Supports both asynchronous (microtask-based) and synchronous (manual or batch-end) flushing.
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
  private maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  get phase(): SchedulerPhase {
    if (this.isProcessing || this.isFlushingSync) {
      return SchedulerPhase.FLUSHING;
    }
    if (this.isBatching) {
      return SchedulerPhase.BATCHING;
    }
    return SchedulerPhase.IDLE;
  }

  /**
   * Schedules a task for execution.
   * Tasks are deduplicated within the same flush cycle using epoch tracking.
   * @param callback - The function to execute.
   * @throws {SchedulerError} If the callback is not a function.
   */
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

    // Swap queues
    const jobs = this.queue;
    const count = this.queueSize;

    this.queue = this.queue === this.queueA ? this.queueB : this.queueA;
    this.queueSize = 0;
    this._epoch++;

    queueMicrotask(() => {
      const flushStarted = startFlush();

      this._processJobs(jobs, count);

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
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this.isFlushingSync = false;
      if (flushStarted) endFlush();
    }
  }

  private _mergeBatchQueue(): void {
    this._epoch++;
    if (this.batchQueueSize > 0) {
      for (let i = 0; i < this.batchQueueSize; i++) {
        const job = this.batchQueue[i];
        if (job && job._nextEpoch !== this._epoch) {
          job._nextEpoch = this._epoch;
          this.queue[this.queueSize++] = job;
        }
      }
      this.batchQueueSize = 0;
    }
  }

  private _drainQueue(): void {
    let iterations = 0;

    while (this.queueSize > 0) {
      if (++iterations > this.maxFlushIterations) {
        this._handleFlushOverflow();
        break;
      }

      this._processCurrentQueue();
      this._mergeBatchQueue();
    }
  }

  private _processCurrentQueue(): void {
    const jobs = this.queue;
    const count = this.queueSize;

    this.queue = this.queue === this.queueA ? this.queueB : this.queueA;
    this.queueSize = 0;
    this._epoch++;

    this._processJobs(jobs, count);
  }

  private _handleFlushOverflow(): void {
    console.error(
      new SchedulerError(
        `Maximum flush iterations (${this.maxFlushIterations}) exceeded. Possible infinite loop.`
      )
    );
    this.queueSize = 0;
    this.queue.length = 0;
    this.batchQueueSize = 0;
  }

  private _processJobs(jobs: SchedulerJob[], count: number): void {
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
  }

  /** Starts a new batch of updates. Updates will be deferred until endBatch is called. */
  startBatch(): void {
    this.batchDepth++;
    this.isBatching = true;
  }

  /**
   * Ends the current batch. If the batch depth reaches zero, all pending updates are flushed synchronously.
   */
  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);

    if (this.batchDepth === 0) {
      this.flushSync();
      this.isBatching = false;
    }
  }

  /**
   * Configures the maximum number of iterations allowed during a synchronous flush.
   * Used to prevent infinite loops.
   * @param max - Maximum iterations count.
   */
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
