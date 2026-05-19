/**
 * @module SchedulerTypes
 *
 * Responsibility:
 * Defines the internal state schemas, job contracts, and buffer structures
 * required by the reactive update scheduler.
 *
 * Design Intent:
 * Orchestrates batching and asynchronous delivery of reactive updates.
 * Prioritizes low-latency propagation while providing safety breaks against
 * infinite recursive updates.
 */

import type { Prettify } from '@but212/atom-effect-utils';
import type { KIND, SCHEDULER_STATE } from '@/constants';

/**
 * Role: Object-Based Scheduler Job
 * Represents a reactive node or object that can be scheduled for execution.
 * @internal
 */
export interface SchedulerJobObject {
  /** The core logic to be executed when the job is flushed. */
  execute(): void;
  /**
   * Logic: Redundancy Prevention
   * Tracks the scheduler epoch in which this job was last added to prevent
   * duplicate scheduling within the same flush iteration.
   * @internal
   */
  _nextEpoch?: number | undefined;
  /**
   * Optimization: Fast Dispatch
   * Discriminator (0: Function, 1: Object) used for low-overhead dispatching.
   * @internal
   */
  _k?: typeof KIND.Obj | undefined;
}

/**
 * Role: Function-Based Scheduler Job
 * Represents a raw callback function that can be scheduled for execution.
 * @internal
 */
export interface SchedulerJobFunction {
  /** The core function logic to be executed. */
  (): void;
  /**
   * Logic: Redundancy Prevention
   * Tracks the scheduler epoch to prevent duplicate scheduling.
   * @internal
   */
  _nextEpoch?: number | undefined;
  /**
   * Optimization: Fast Dispatch
   * Discriminator used for low-overhead dispatching.
   * @internal
   */
  _k?: typeof KIND.Fn | undefined;
}

/**
 * Unified type for any unit of work managed by the scheduler.
 * @internal
 */
export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

/**
 * Role: Pre-Allocated Job Buffer
 * A high-performance structure for batching scheduler jobs.
 *
 * Why: Memory Stability
 * Using a pre-allocated array with manual size tracking avoids the overhead
 * of frequent V8 array resizing and garbage collection during high-frequency
 * update bursts.
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
 * Role: Global Scheduler State
 * The complete internal state container for the reactive update scheduler.
 *
 * Logic: Double-Buffering
 * The scheduler uses multiple buffers (`active`, `standby`) to isolate jobs
 * currently being executed from those scheduled during the current execution
 * cycle (nested updates), ensuring deterministic flush order.
 *
 * @internal
 */
export type SchedulerState = Prettify<{
  /**
   * Logic: Monotonic Epoch
   * The current global version of the scheduler loop, used for job deduplication.
   */
  epoch: number;
  /** Logic: Activity Bitmask (IDLE, PROCESSING, etc.) */
  state: (typeof SCHEDULER_STATE)[keyof typeof SCHEDULER_STATE];
  /** Logic: Nested Batch Tracking */
  batchDepth: number;
  /** Constraint: Maximum iterations permitted before a flush cycle is aborted. */
  maxFlushIterations: number;
  /** Indicates if a high-frequency execution session is currently being monitored. */
  sessionActive: boolean;
  sessionEpoch: number;
  sessionExecutionCount: number;

  /** Logic: Current total number of jobs across all buffers. */
  queueSize: number;

  /** Callback triggered if the job buffers exceed their capacity limits. */
  onOverflow: ((droppedCount: number) => void) | null;

  // Methods
  nextEpoch(): number;
  startFlush(): boolean;
  endFlush(): void;
  incrementFlushExecutionCount(): number;
  resetFlushState(): void;
  schedule(callback: SchedulerJob): void;
  flushSync(): void;
  startBatch(): void;
  endBatch(): void;
}>;

/**
 * Role: Scheduler Safety Configuration
 * Global configuration parameters for the Scheduler.
 * @internal
 */
export interface SchedulerConfig {
  /** Constraint: Maximum number of total executions allowed per second. */
  MAX_EXECUTIONS_PER_SECOND: number;
  /** Constraint: Maximum number of times a single effect can run within one microtask. */
  MAX_EXECUTIONS_PER_EFFECT: number;
  /** Constraint: Maximum number of total job executions allowed per flush cycle. */
  MAX_EXECUTIONS_PER_FLUSH: number;
  /** Constraint: Hard iterations limit for the drain-loop safety break. */
  MAX_FLUSH_ITERATIONS: number;
  /** Logic: Minimum iterations required to allow nested batches to resolve. */
  MIN_FLUSH_ITERATIONS: number;
  /** Optimization: Memory threshold for shrinking job buffers back to initial capacity. */
  BATCH_QUEUE_SHRINK_THRESHOLD: number;
}
