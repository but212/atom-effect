/**
 * @fileoverview Dependency tracking context for reactive state management
 * @description Global execution context that enables automatic dependency tracking
 */

/**
 * Interface for listeners that can track dependencies
 *
 * Listeners can be either computed values or effects that need to know
 * which atoms they depend on.
 */
export interface DependencyTracker {
  /** Called when a dependency is accessed during execution */
  addDependency?: (dep: unknown) => void;
  /** Called when dependencies change */
  execute?: () => void;
}

/**
 * Listener type: either a DependencyTracker object or a simple function
 *
 * Function listeners are used for simple subscriptions where we just
 * need to re-run a callback. DependencyTracker is used for computed
 * values and effects that need more control.
 */
export type Listener = DependencyTracker | (() => void);

/**
 * Tracking context interface
 *
 * Provides a global context stack for tracking which reactive primitive
 * (computed or effect) is currently executing. This enables automatic
 * dependency detection when atoms are accessed.
 */
export interface TrackingContext {
  /**
   * Currently executing listener (top of the context stack)
   * Null when no reactive primitive is executing
   */
  current: Listener | null;

  /**
   * Executes a function with dependency tracking enabled
   *
   * Sets the current listener, runs the function, and restores the
   * previous listener. This creates a stack of execution contexts
   * that allows nested computed/effect calls.
   *
   * @template T - Return type of the function
   * @param listener - Listener to set as current during execution
   * @param fn - Function to execute with tracking enabled
   * @returns Return value from the function
   */
  run<T>(listener: Listener, fn: () => T): T;

  /**
   * Gets the currently executing listener
   *
   * Used by atoms to determine if they should register themselves
   * as a dependency.
   *
   * @returns Current listener, or null if not in a tracked context
   */
  getCurrent(): Listener | null;
}

/**
 * Global tracking context singleton
 *
 * This is the central mechanism that enables automatic dependency tracking.
 * When a computed value or effect runs, it sets itself as the current listener.
 * Any atoms accessed during execution will check this context and register
 * the listener as a subscriber.
 *
 * @example
 * ```ts
 * // Inside computed implementation:
 * trackingContext.run(markDirty, computeFn);
 *
 * // Inside atom.value getter:
 * const current = trackingContext.getCurrent();
 * if (current) {
 *   // Register current as a subscriber
 * }
 * ```
 */
export const trackingContext: TrackingContext = {
  current: null,

  run<T>(listener: Listener, fn: () => T): T {
    const prev = this.current;
    this.current = listener;
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  },

  getCurrent(): Listener | null {
    return this.current;
  },
};
