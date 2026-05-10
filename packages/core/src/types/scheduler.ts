/**
 * @module Scheduler_Types
 *
 * Responsibility:
 * Defines the internal state schemas, job contracts, and buffer structures
 * required by the reactive update scheduler.
 */

import type { Prettify } from '@but212/atom-effect-utils';
import type { KIND, SCHEDULER_STATE } from '@/constants';

/**
 * Interface for object-based work units managed by the scheduler.
 * @internal
 */
export interface SchedulerJobObject {
  /** The core logic to be executed when the job is flushed. */
  execute(): void;
  /**
   * @internal
   * Tracks the scheduler epoch in which this job was last added to prevent
   * redundant scheduling within the same flush iteration.
   */
  _nextEpoch?: number | undefined;
  /** @internal Fast-path discriminator (0: Function, 1: Object). */
  _k?: (typeof KIND)[keyof typeof KIND] | undefined;
}

/**
 * Interface for function-based work units managed by the scheduler.
 * @internal
 */
export interface SchedulerJobFunction {
  /** The core function logic to be executed. */
  (): void;
  /**
   * @internal
   * Tracks the scheduler epoch to prevent redundant scheduling.
   */
  _nextEpoch?: number | undefined;
  /** @internal Fast-path discriminator. */
  _k?: (typeof KIND)[keyof typeof KIND] | undefined;
}

/**
 * Unified type for any unit of work managed by the scheduler.
 * @internal
 */
export type SchedulerJob =
  | (SchedulerJobFunction & { _k?: typeof KIND.Fn | undefined })
  | (SchedulerJobObject & { _k?: typeof KIND.Obj | undefined });

/**
 * A high-performance buffer for batching scheduler jobs.
 *
 * Why: Using a pre-allocated array with manual size tracking avoids the
 * overhead of frequent array resizing during high-frequency updates.
 *
 * @internal
 */
export type JobBuffer = Prettify<{
  /** Fixed-capacity array of jobs. */
  items: (SchedulerJob | undefined)[];
  /** Current number of active jobs in the buffer. */
  size: number;
}>;

/**
 * The complete internal state of the reactive update scheduler.
 *
 * Logic: Double-Buffering
 * The scheduler uses multiple buffers (`active`, `standby`) to isolate jobs
 * being executed from jobs that are scheduled during the current execution cycle.
 *
 * @internal
 */
export type SchedulerState = Prettify<{
  /** The current global version of the scheduler loop. */
  epoch: number;
  /** Bitmask representing the scheduler's current activity (IDLE, PROCESSING, etc.). */
  state: (typeof SCHEDULER_STATE)[keyof typeof SCHEDULER_STATE];
  /** Current nesting depth of `batch()` blocks. */
  batchDepth: number;
  /** Maximum iterations permitted before a flush cycle is forcibly terminated. */
  maxFlushIterations: number;
  /** Indicates if a high-frequency execution session is currently being monitored. */
  sessionActive: boolean;
  sessionEpoch: number;
  sessionExecutionCount: number;

  /** Jobs currently awaiting execution. */
  active: JobBuffer;
  /** Jobs scheduled during the current flush that will run in the next iteration. */
  standby: JobBuffer;
  /** Temporary buffer for accumulating updates during a `batch()` block. */
  batch: JobBuffer;
  /** @internal Pointer to the buffer currently being flushed. */
  _current: JobBuffer;

  /** Callback triggered if the job buffers exceed their capacity limits. */
  onOverflow: ((droppedCount: number) => void) | null;
}>;

/**
 * Global configuration parameters for the Scheduler.
 * @internal
 */
export interface SchedulerConfig {
  /** Maximum number of total executions allowed per second. */
  MAX_EXECUTIONS_PER_SECOND: number;
  /** Maximum number of times a single effect can run within one microtask. */
  MAX_EXECUTIONS_PER_EFFECT: number;
  /** Maximum number of total job executions allowed per flush cycle. */
  MAX_EXECUTIONS_PER_FLUSH: number;
  /** Hard iterations limit for the drain-loop safety break. */
  MAX_FLUSH_ITERATIONS: number;
  /** Minimum iterations required to allow nested batches to resolve. */
  MIN_FLUSH_ITERATIONS: number;
  /** Memory threshold for shrinking job buffers back to initial capacity. */
  BATCH_QUEUE_SHRINK_THRESHOLD: number;
}
