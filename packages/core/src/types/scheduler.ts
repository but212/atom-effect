import type { Prettify } from '@but212/atom-effect-utils';
import type { KIND, SCHEDULER_STATE } from '@/constants';

/**
 * Contract for objects that can be scheduled by the reactive engine.
 * @internal
 */
export interface SchedulerJobObject {
  execute(): void;
  /** @internal */
  _nextEpoch?: number | undefined;
  /** @internal */
  _k?: (typeof KIND)[keyof typeof KIND] | undefined;
}

/**
 * Contract for functions that can be scheduled by the reactive engine.
 * @internal
 */
export interface SchedulerJobFunction {
  (): void;
  /** @internal */
  _nextEpoch?: number | undefined;
  /** @internal */
  _k?: (typeof KIND)[keyof typeof KIND] | undefined;
}

/**
 * Unified type for any unit of work managed by the scheduler.
 * @internal
 */
export type SchedulerJob =
  | (SchedulerJobFunction & { _k?: typeof KIND.Fn | undefined })
  | (SchedulerJobObject & { _k?: typeof KIND.Obj | undefined });

/** @internal */
export type JobBuffer = Prettify<{
  items: (SchedulerJob | undefined)[];
  size: number;
}>;

/**
 * Internal Scheduler State
 * @internal
 */
export type SchedulerState = Prettify<{
  epoch: number;
  state: (typeof SCHEDULER_STATE)[keyof typeof SCHEDULER_STATE];
  batchDepth: number;
  maxFlushIterations: number;
  sessionActive: boolean;
  sessionEpoch: number;
  sessionExecutionCount: number;
  active: JobBuffer;
  standby: JobBuffer;
  batch: JobBuffer;
  _current: JobBuffer;
  onOverflow: ((droppedCount: number) => void) | null;
}>;

/**
 * Global configuration parameters for the Scheduler.
 * @internal
 */
export interface SchedulerConfig {
  MAX_EXECUTIONS_PER_SECOND: number;
  MAX_EXECUTIONS_PER_EFFECT: number;
  MAX_EXECUTIONS_PER_FLUSH: number;
  MAX_FLUSH_ITERATIONS: number;
  MIN_FLUSH_ITERATIONS: number;
  BATCH_QUEUE_SHRINK_THRESHOLD: number;
}
