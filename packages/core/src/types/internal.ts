/**
 * @module Internal_Engine_Types
 *
 * Responsibility:
 * Defines engine-private interfaces and state schemas. These types are
 * used for core reactive propagation and are not exposed to the public API.
 */

import type { KIND } from '@/constants';
import type { Dependency, Subscriber } from './reactive';

/**
 * Global tracking state for dependency collection.
 *
 * Why: Manages a stack of active computations to correctly associate
 * dependencies during nested computed or effect evaluations.
 *
 * @internal
 */
export interface TrackingContext {
  /** The stack of parent computations currently being evaluated. */
  stack: (DependencySubscriber | null)[];
  /** The current active subscriber recording dependencies. */
  current: DependencySubscriber | null;
}

/**
 * Role: A node capable of recording reactive dependencies.
 * @internal
 */
export interface DependencySubscriber {
  /** Records a dependency in the current computation's tracking buffer. */
  addDependency(dep: Dependency): void;
}

/**
 * Role: A node that can be scheduled and executed by the scheduler.
 * @internal
 */
export interface ExecutableSubscriber {
  /** Performs the core computation or side-effect logic. */
  execute(): void;
}

/**
 * Role: A unified consumer that both tracks dependencies and executes logic.
 * @internal
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/**
 * Internal discriminator used for fast subscriber dispatch.
 * @internal
 */
export type SubscriberKind = (typeof KIND)[keyof typeof KIND];

/**
 * Internal type for objects or functions that can receive update notifications.
 * @internal
 */
export type SubscriberTarget<T> = ((newValue?: T, oldValue?: T) => void) | Subscriber;

/**
 * Diagnostic metrics for analyzing memory health and pooling efficiency.
 * @internal
 */
export interface PoolStats {
  acquired: number;
  released: number;
  /** Reasons for object rejection from the recycler. */
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}

/**
 * Metadata for reactive nodes used in performance-critical hot paths.
 *
 * Optimization:
 * Properties prefixed with `_` are used for internal drift detection logic
 * and are optimized for direct property access in the V8 engine.
 *
 * @internal
 */
export interface InternalNode {
  /** Tracks the computation epoch to detect dependency drift. */
  _trackEpoch: number;
  /** Current count of recorded dependencies in the tracking buffer. */
  _trackCount: number;
  /** Captures the last error encountered during node evaluation. */
  _error: Error | null;
  /** Indicates if the node is in a failed async state. */
  isRejected: boolean;
}
