/**
 * @fileoverview Batch processing scheduler for reactive updates
 * @description Manages notification scheduling with microtask-based batching and nested batch support
 */

import { SchedulerError } from '../errors/errors';

/**
 * Scheduler for batching reactive updates
 *
 * The scheduler provides two execution modes:
 * 1. **Normal mode**: Uses queueMicrotask for async execution
 * 2. **Batch mode**: Defers notifications until batch completes, supports nesting
 *
 * Key optimizations:
 * - Set-based deduplication prevents redundant callbacks
 * - Array-based batch queue for faster batch-mode additions
 * - Nested batch support via depth counter
 * - Sync execution within batches, async execution outside
 *
 * @example
 * ```ts
 * scheduler.startBatch();
 * atom1.value = 1; // Scheduled but not executed
 * atom2.value = 2; // Scheduled but not executed
 * scheduler.endBatch(); // Both updates execute in one cycle
 * ```
 */
class Scheduler {
  /** Set-based queue for deduplication of callbacks */
  private queue: Set<() => void> = new Set();

  /** Whether scheduler is currently processing callbacks */
  private isProcessing: boolean = false;

  /** Whether currently in batch mode */
  public isBatching: boolean = false;

  /** Nesting depth of batch() calls (supports nested batching) */
  private batchDepth: number = 0;

  /** Array-based queue for faster batch-mode additions */
  private batchQueue: Array<() => void> = [];

  /** Current size of batch queue (avoids array.length overhead) */
  private batchQueueSize = 0;

  /** Whether currently flushing synchronously (during batch end) */
  private isFlushingSync: boolean = false;

  /** Maximum flush iterations to prevent infinite loops */
  private maxFlushIterations: number = 1000;

  /**
   * Schedules a callback for execution
   *
   * Behavior depends on current mode:
   * - Batch mode: Adds to batch queue (executed when batch ends)
   * - Normal mode: Adds to main queue and flushes asynchronously
   *
   * @param callback - Function to execute
   * @throws {SchedulerError} If callback is not a function
   */
  schedule(callback: () => void): void {
    if (typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    // During batch or sync flush, add to batch queue
    if (this.isBatching || this.isFlushingSync) {
      // Batch mode: Fast array addition
      this.batchQueue[this.batchQueueSize++] = callback;
    } else {
      this.queue.add(callback);
      if (!this.isProcessing) {
        this.flush();
      }
    }
  }

  /**
   * Flushes all queued callbacks asynchronously
   *
   * Uses queueMicrotask for async execution outside of batch mode.
   * Should not be called directly during batch completion.
   *
   * @private
   */
  private flush(): void {
    if (this.isProcessing || this.queue.size === 0) return;

    this.isProcessing = true;
    const callbacks = Array.from(this.queue);
    this.queue.clear();

    // Asynchronous execution path: uses queueMicrotask (outside batch)
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
   * Flushes all queued callbacks synchronously
   *
   * Used exclusively by endBatch() to ensure batch updates execute
   * synchronously before batch completion.
   * Recursively processes any callbacks scheduled during execution.
   *
   * @private
   */
  private flushSync(): void {
    this.isFlushingSync = true;

    try {
      // Merge batch queue into main queue
      if (this.batchQueueSize > 0) {
        for (let i = 0; i < this.batchQueueSize; i++) {
          this.queue.add(this.batchQueue[i]!);
        }
        this.batchQueueSize = 0;
      }

      // Safety limit to prevent infinite loops
      let iterations = 0;

      // Process all callbacks, including those scheduled during execution
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

        // Synchronous execution
        for (let i = 0; i < callbacks.length; i++) {
          try {
            callbacks[i]?.();
          } catch (error) {
            console.error(
              new SchedulerError('Error occurred during batch execution', error as Error)
            );
          }
        }

        // Merge any new batch queue items that were added during execution
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
   * Starts a batch operation
   *
   * Increments batch depth to support nested batching.
   * Multiple startBatch() calls require matching endBatch() calls.
   */
  startBatch(): void {
    this.batchDepth++;
    this.isBatching = true;
  }

  /**
   * Ends a batch operation
   *
   * Decrements batch depth and flushes callbacks synchronously when depth reaches zero.
   * Supports nested batching by only flushing at the outermost level.
   */
  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);

    if (this.batchDepth === 0) {
      // Execute synchronously BEFORE turning off batch mode
      this.flushSync();
      this.isBatching = false;
    }
  }

  /**
   * Sets maximum flush iterations to prevent infinite loops
   *
   * Use this when working with complex dependency graphs that require
   * more iterations to stabilize. Default is 1000.
   *
   * @param max - Maximum iterations (minimum: 10, default: 1000)
   * @throws {SchedulerError} If max is less than 10
   *
   * @example
   * ```ts
   * import { scheduler } from '@but212/reactive-atom';
   *
   * // Increase limit for complex graphs
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

/**
 * Global scheduler singleton
 *
 * Used by all reactive primitives for scheduling notifications.
 * Ensures consistent batching behavior across the entire library.
 */
export const scheduler = new Scheduler();
