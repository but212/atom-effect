import { SchedulerError } from '../errors/errors';

/**
 * Scheduler for managing reactive updates and batching operations.
 *
 * The Scheduler is responsible for coordinating when reactive computations
 * are executed. It supports both immediate (microtask) execution and
 * batched synchronous execution for optimal performance.
 *
 * Key features:
 * - Deduplication of callbacks via Set
 * - Nested batch support with depth tracking
 * - Infinite loop protection with configurable iteration limit
 * - Error isolation to prevent one callback from breaking others
 *
 * @example
 * ```typescript
 * // Schedule a callback for microtask execution
 * scheduler.schedule(() => console.log('Updated!'));
 *
 * // Batch multiple updates
 * scheduler.startBatch();
 * scheduler.schedule(() => console.log('Update 1'));
 * scheduler.schedule(() => console.log('Update 2'));
 * scheduler.endBatch(); // Both execute synchronously here
 * ```
 */
/**
 * Phases of the scheduler execution cycle.
 */
export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

type SchedulerJob = (() => void) & { _nextEpoch?: number };

class Scheduler {
  /** Queue of callbacks waiting for microtask execution */
  /** Queue buffers for double buffering optimization */
  private queueA: SchedulerJob[] = [];
  private queueB: SchedulerJob[] = [];

  /** Currently active queue receiving new tasks */
  private queue: SchedulerJob[] = this.queueA;
  private queueSize = 0;

  /** Epoch for O(1) deduplication */
  private _epoch = 0;

  /** Whether the scheduler is currently processing the queue */
  private isProcessing: boolean = false;

  /** Whether batching is currently active */
  public isBatching: boolean = false;

  /** Current nesting depth of batch operations */
  private batchDepth: number = 0;

  /** Array of callbacks queued during batching */
  private batchQueue: SchedulerJob[] = [];

  /** Current size of the batch queue (for array reuse) */
  private batchQueueSize = 0;

  /** Whether synchronous flush is in progress */
  private isFlushingSync: boolean = false;

  /** Maximum iterations allowed during flush to prevent infinite loops */
  private maxFlushIterations: number = 1000;

  /**
   * Gets the current phase of the scheduler.
   */
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
   * Schedules a callback for execution.
   *
   * If batching is active or a sync flush is in progress, the callback
   * is added to the batch queue. Otherwise, it's added to the main queue
   * and a flush is triggered via microtask.
   *
   * @param callback - The function to schedule for execution
   * @throws {SchedulerError} If callback is not a function
   *
   * @example
   * ```typescript
   * scheduler.schedule(() => {
   *   // This runs in the next microtask (or sync if batching)
   *   updateUI();
   * });
   * ```
   */
  schedule(callback: SchedulerJob): void {
    if (typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    // O(1) Unique dedup check
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

  /**
   * Flushes the queue asynchronously via microtask.
   *
   * Executes all queued callbacks in a microtask, allowing the current
   * synchronous execution to complete first. Errors in individual
   * callbacks are caught and logged without interrupting others.
   *
   * @private
   * @remarks
   * This method is idempotent - calling it multiple times while
   * processing is active has no effect.
   */
  private flush(): void {
    if (this.isProcessing || this.queueSize === 0) return;

    this.isProcessing = true;

    // Double buffering: Swap queues to snapshot current tasks
    // This allows adding new tasks to the other queue while processing
    const jobs = this.queue;
    const count = this.queueSize;

    // Swap queues
    this.queue = this.queue === this.queueA ? this.queueB : this.queueA;
    this.queueSize = 0;
    
    // Increment epoch to invalidate previous task deduplication
    this._epoch++;

    queueMicrotask(() => {
      // Performance: Iterate Array by index
      for (let i = 0; i < count; i++) {
        try {
          jobs[i]?.();
        } catch (error) {
          console.error(
            new SchedulerError('Error occurred during scheduler execution', error as Error)
          );
        }
      }

      // Reuse array capacity
      jobs.length = 0;
      this.isProcessing = false;

      // If new tasks were added to the active queue (the one we swapped to), flush again
      if (this.queueSize > 0 && !this.isBatching) {
        this.flush();
      }
    });
  }

  /**
   * Flushes all queued callbacks synchronously.
   *
   * This method is called when a batch ends. It processes all callbacks
   * in the batch queue and main queue synchronously, allowing callbacks
   * to schedule additional callbacks that are processed in the same flush.
   *
   * @private
   * @remarks
   * - Includes infinite loop protection via maxFlushIterations
   * - Errors in callbacks are caught and logged individually
   * - The isFlushingSync flag prevents re-entrancy issues
   */
  private flushSync(): void {
    this.isFlushingSync = true;

    try {
      if (this.batchQueueSize > 0) {
        for (let i = 0; i < this.batchQueueSize; i++) {
          // O(1) Unique dedup check for batch queue transfer
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
              `Maximum flush iterations (${this.maxFlushIterations}) exceeded. ` +
                `Possible infinite loop in reactive dependencies. ` +
                `Consider increasing the limit with scheduler.setMaxFlushIterations()`
            )
          );
          // clear queue
          this.queueSize = 0;
          this.queue.length = 0;
          this.batchQueueSize = 0;
          break;
        }

        // Double buffering: Swap and process
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
            const job = this.batchQueue[i]!;
            if (job._nextEpoch !== this._epoch) {
              job._nextEpoch = this._epoch;
              this.queue[this.queueSize++] = job;
            }
          }
          this.batchQueueSize = 0;
        }
      }
    } finally {
      this.isFlushingSync = false;
    }
  }

  /**
   * Starts a new batch operation.
   *
   * While batching is active, all scheduled callbacks are deferred
   * until endBatch() is called. Batches can be nested - only the
   * outermost endBatch() triggers execution.
   *
   * @example
   * ```typescript
   * scheduler.startBatch();
   * // All updates here are deferred
   * atom1.value = 'a';
   * atom2.value = 'b';
   * scheduler.endBatch(); // Both updates processed together
   * ```
   */
  startBatch(): void {
    this.batchDepth++;
    this.isBatching = true;
  }

  /**
   * Ends a batch operation.
   *
   * Decrements the batch depth counter. When depth reaches zero,
   * all queued callbacks are flushed synchronously and batching
   * is disabled.
   *
   * @remarks
   * Safe to call even if startBatch() wasn't called - depth is
   * clamped to zero minimum.
   *
   * @example
   * ```typescript
   * scheduler.startBatch();
   * try {
   *   // ... batched operations
   * } finally {
   *   scheduler.endBatch(); // Always end batch, even on error
   * }
   * ```
   */
  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);

    if (this.batchDepth === 0) {
      this.flushSync();
      this.isBatching = false;
    }
  }

  /**
   * Sets the maximum number of flush iterations allowed.
   *
   * This limit prevents infinite loops when reactive dependencies
   * form cycles. If exceeded, the queue is cleared and an error
   * is logged.
   *
   * @param max - Maximum iterations (must be at least 10)
   * @throws {SchedulerError} If max is less than 10
   *
   * @example
   * ```typescript
   * // Increase limit for complex dependency graphs
   * scheduler.setMaxFlushIterations(5000);
   * ```
   */
  setMaxFlushIterations(max: number): void {
    if (max < 10) {
      throw new SchedulerError('Max flush iterations must be at least 10');
    }
    this.maxFlushIterations = max;
  }
}

/** Global scheduler instance for reactive updates */
export const scheduler = new Scheduler();
