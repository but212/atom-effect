/**
 * @module InternalEngineTypes
 *
 * Responsibility:
 * Defines engine-private interfaces and state schemas for core reactive
 * propagation.
 *
 * Design Intent:
 * Provides the structural foundation for dependency tracking, scheduler
 * execution, and memory management. These types are strictly internal and
 * must not be exposed to the public API.
 */

import type { KIND } from '@/constants';
import type { Dependency, Subscriber } from './reactive';

/**
 * Role: Dependency Tracking Registry
 * Manages the global state of active computations to ensure correct
 * association between dependencies and their consumers.
 *
 * Why:
 * A stack is required to handle nested evaluations (e.g., an effect reading
 * a computed value), ensuring that dependencies are attributed to the
 * correct subscriber at each level of depth.
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
 * Logic: Fast Dispatch Discriminator
 * Used by the scheduler and reactive engine to identify subscriber types
 * without expensive `instanceof` checks.
 * @internal
 */
export type SubscriberKind = (typeof KIND)[keyof typeof KIND];

/**
 * Role: Polymorphic Notification Target
 * Supports both functional callbacks for external listeners and structured
 * `Subscriber` nodes for internal propagation.
 * @internal
 */
export type SubscriberTarget<T> = ((newValue?: T, oldValue?: T) => void) | Subscriber;

/**
 * Role: Memory Health Diagnostics
 * Provides metrics for analyzing pooling efficiency and identifying potential
 * resource leaks or recycler rejections.
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
