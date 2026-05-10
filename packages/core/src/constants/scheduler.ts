import type { SchedulerConfig } from '../types';

/**
 * Internal state flags for the Scheduler.
 * @internal
 */
export const SCHEDULER_STATE = {
  IDLE: 0,
  PROCESSING: 1 << 0,
  FLUSHING_SYNC: 1 << 1,
  BATCHING: 1 << 2,
} as const;

/**
 * Global configuration parameters for the Scheduler.
 *
 * Caution: Modification of these thresholds can lead to instability,
 * memory leaks, or execution overflows in complex dependency graphs.
 */
export const SCHEDULER_CONFIG = Object.freeze({
  /**
   * Reason: Prevents infinite loops or runaway effects from freezing the main thread.
   */
  MAX_EXECUTIONS_PER_SECOND: 1000,
  /**
   * Reason: Detects and stops circular dependencies within a single microtask.
   */
  MAX_EXECUTIONS_PER_EFFECT: 100,

  /**
   * Reason: Limits the total workload per flush to maintain frame-rate stability.
   */
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  /**
   * Reason: Safety break for the drain-loop to prevent stack overflows or infinite flushing.
   */
  MAX_FLUSH_ITERATIONS: 1000,
  /**
   * Optimization: Batching
   * Ensures a minimum number of iterations are processed to allow for nested batched updates.
   */
  MIN_FLUSH_ITERATIONS: 10,

  /**
   * Optimization: Memory Pressure
   * Threshold for shrinking the internal batch queue to release memory back to the heap.
   */
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
} satisfies SchedulerConfig);
