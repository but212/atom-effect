/**
 * @module SchedulerConstants
 *
 * Responsibility:
 * Defines the internal state machine and global execution thresholds for
 * the reactive update scheduler.
 */

import type { SchedulerConfig } from '../types';

/**
 * Internal state flags for the Scheduler.
 *
 * Logic:
 * Uses bitwise flags to allow the scheduler to track overlapping states
 * (e.g., `PROCESSING` while also `BATCHING`) without complex boolean logic.
 *
 * @internal
 */
export const SCHEDULER_STATE = Object.freeze({
  IDLE: 0,
  /** Currently executing the reactive update loop. */
  PROCESSING: 1 << 0,
  /** Processing a synchronous flush (e.g., via `.get()`). */
  FLUSHING_SYNC: 1 << 1,
  /** Accumulating updates to be processed in a single batch. */
  BATCHING: 1 << 2,
} as const satisfies Record<string, number>);

/**
 * Global configuration and stability thresholds for the Scheduler.
 *
 * Caution:
 * These values are tuned for balancing UI responsiveness and library
 * stability. Modifying them can lead to main-thread freezes or memory leaks
 * in complex dependency graphs.
 */
const config = {
  /**
   * Why: Prevents runaway effects or infinite re-computations from
   * permanently freezing the main thread.
   */
  MAX_EXECUTIONS_PER_SECOND: 1000,

  /**
   * Why: Detects and kills circular dependency loops within a single
   * microtask before they cause a stack overflow.
   */
  MAX_EXECUTIONS_PER_EFFECT: 100,

  /**
   * Why: Caps the total workload per microtask to maintain frame-rate
   * stability (16.7ms window) in high-frequency update scenarios.
   */
  MAX_EXECUTIONS_PER_FLUSH: 10000,

  /**
   * Why: Provides a safety break for the drain-loop to prevent infinite
   * flushing of perpetually dirty nodes.
   */
  MAX_FLUSH_ITERATIONS: 1000,

  /**
   * Why: Ensures a minimum number of iterations to allow for
   * deep-nested batched updates to resolve.
   */
  MIN_FLUSH_ITERATIONS: 10,

  /**
   * Optimization: Memory Management
   * Why: Triggers a manual shrink of the internal batch queue when its
   * size exceeds this threshold, releasing memory back to the heap.
   */
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
} as const satisfies SchedulerConfig;

// Validate configuration invariants at initialization
if (
  config.MIN_FLUSH_ITERATIONS <= 0 ||
  config.MAX_FLUSH_ITERATIONS < config.MIN_FLUSH_ITERATIONS ||
  config.MAX_EXECUTIONS_PER_FLUSH < config.MAX_EXECUTIONS_PER_EFFECT ||
  config.MAX_EXECUTIONS_PER_SECOND <= 0 ||
  config.MAX_EXECUTIONS_PER_EFFECT <= 0 ||
  config.BATCH_QUEUE_SHRINK_THRESHOLD <= 0
) {
  throw new Error('[SchedulerConfig] Invariant violation: Invalid scheduler configuration values.');
}

export const SCHEDULER_CONFIG = Object.freeze(config);
