/**
 * @module SchedulerConstants
 *
 * Defines the internal state flags and global configuration thresholds for
 * the reactive update scheduler.
 */

import type { SchedulerConfig } from '../types';

/**
 * Internal state flags for the Scheduler using bitwise flags.
 * Allows tracking overlapping states without complex boolean logic.
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
} as const);

/**
 * Global configuration and stability thresholds for the Scheduler.
 */
export const SCHEDULER_CONFIG = Object.freeze({
  /** Prevents runaway effects or infinite loops from freezing the main thread. */
  MAX_EXECUTIONS_PER_SECOND: 1000,

  /** Detects circular dependency loops within a microtask to prevent stack overflow. */
  MAX_EXECUTIONS_PER_EFFECT: 100,

  /** Caps workload per microtask to maintain frame-rate stability. */
  MAX_EXECUTIONS_PER_FLUSH: 10000,

  /** Hard iterations limit for the drain-loop safety break. */
  MAX_FLUSH_ITERATIONS: 1000,

  /** Minimum iterations required to allow nested batches to resolve. */
  MIN_FLUSH_ITERATIONS: 10,

  /** Memory threshold to shrink the batch queue, releasing memory back to the heap. */
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
} as const satisfies SchedulerConfig);
