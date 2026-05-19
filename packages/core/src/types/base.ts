/**
 * @module BaseTypes
 *
 * Responsibility:
 * Defines the fundamental primitives and lifecycle interfaces shared across
 * the entire reactive engine.
 */

import type { AsyncState } from '@/constants';

/**
 * A unique monotonic identifier for reactive nodes.
 *
 * Why: Used to track and compare dependency updates in the reactive loop
 * with minimal memory overhead compared to object-reference comparisons.
 */
export type DependencyId = number;

/**
 * Interface for objects requiring explicit resource release.
 *
 * When to use:
 * - For long-lived resources such as event listeners, timers, or DOM observers
 *   that must be detached to prevent memory leaks when a node is destroyed.
 */
export interface Disposable {
  /**
   * Releases internal resources and detaches the node from the reactive graph.
   * After disposal, the object should be considered inactive.
   */
  dispose(): void;
}

/**
 * The union of all valid asynchronous lifecycle states.
 */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];
