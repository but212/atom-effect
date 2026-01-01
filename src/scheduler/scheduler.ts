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
class Scheduler {
  /** Queue of callbacks waiting for microtask execution */
  private queue: Set<() => void> = new Set();

  /** Whether the scheduler is currently processing the queue */
  private isProcessing: boolean = false;

  /** Whether batching is currently active */
  public isBatching: boolean = false;

  /** Current nesting depth of batch operations */
  private batchDepth: number = 0;

  /** Array of callbacks queued during batching */
  private batchQueue: Array<() => void> = [];

  /** Current size of the batch queue (for array reuse) */
  private batchQueueSize = 0;

  /** Whether synchronous flush is in progress */
  private isFlushingSync: boolean = false;

  /** Maximum iterations allowed during flush to prevent infinite loops */
  private maxFlushIterations: number = 1000;

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
  schedule(callback: () => void): void {
    if (typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    if (this.isBatching || this.isFlushingSync) {
      this.batchQueue[this.batchQueueSize++] = callback;
    } else {
      this.queue.add(callback);
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
    if (this.isProcessing || this.queue.size === 0) return;

    this.isProcessing = true;
    const callbacks = Array.from(this.queue);
    this.queue.clear();

    queueMicrotask(() => {
      for (let i = 0; i < callbacks.length; i++) {
        try {
          callbacks[i]?.();
        } catch (error) {
          console.error(
            new SchedulerError('Error occurred during scheduler execution', error as Error)
          );
        }
      }

      this.isProcessing = false;

      if (this.queue.size > 0 && !this.isBatching) {
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
          this.queue.add(this.batchQueue[i]!);
        }
        this.batchQueueSize = 0;
      }

      let iterations = 0;

      while (this.queue.size > 0) {
        if (++iterations > this.maxFlushIterations) {
          console.error(
            new SchedulerError(
              `Maximum flush iterations (${this.maxFlushIterations}) exceeded. ` +
                `Possible infinite loop in reactive dependencies. ` +
                `Consider increasing the limit with scheduler.setMaxFlushIterations()`
            )
          );
          this.queue.clear();
          this.batchQueueSize = 0;
          break;
        }

        const callbacks = Array.from(this.queue);
        this.queue.clear();

        for (let i = 0; i < callbacks.length; i++) {
          try {
            callbacks[i]?.();
          } catch (error) {
            console.error(
              new SchedulerError('Error occurred during batch execution', error as Error)
            );
          }
        }

        if (this.batchQueueSize > 0) {
          for (let i = 0; i < this.batchQueueSize; i++) {
            this.queue.add(this.batchQueue[i]!);
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
