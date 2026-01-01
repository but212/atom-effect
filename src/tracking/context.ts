import type { Listener } from './tracking.types';

/**
 * Interface for the tracking context that manages dependency tracking.
 *
 * The tracking context is responsible for maintaining the current listener
 * during reactive computations, enabling automatic dependency collection.
 *
 * @interface TrackingContext
 */
export interface TrackingContext {
  /**
   * The currently active listener being tracked.
   * `null` when no tracking is in progress.
   */
  current: Listener | null;

  /**
   * Executes a function within a tracking context.
   *
   * Sets the provided listener as the current tracking target,
   * executes the function, and restores the previous context.
   *
   * @template T - The return type of the function
   * @param listener - The listener to set as current during execution
   * @param fn - The function to execute within the tracking context
   * @returns The result of the executed function
   *
   * @example
   * ```typescript
   * const result = trackingContext.run(myListener, () => {
   *   // Any atom access here will be tracked
   *   return someAtom.value + otherAtom.value;
   * });
   * ```
   */
  run<T>(listener: Listener, fn: () => T): T;

  /**
   * Gets the currently active listener.
   *
   * @returns The current listener or `null` if no tracking is active
   *
   * @example
   * ```typescript
   * const current = trackingContext.getCurrent();
   * if (current) {
   *   // Dependency tracking is active
   * }
   * ```
   */
  getCurrent(): Listener | null;
}

/**
 * Global tracking context singleton for dependency tracking.
 *
 * This object manages the current listener during reactive computations,
 * enabling atoms and computed values to automatically track their dependencies.
 *
 * @remarks
 * - The context uses a stack-like behavior via the `run` method
 * - Nested `run` calls properly restore the previous context
 * - Thread-safe within a single JavaScript execution context
 *
 * @example
 * ```typescript
 * // Setting up tracking for a computed value
 * const value = trackingContext.run(computedListener, () => {
 *   return atom1.value + atom2.value; // Both atoms are tracked
 * });
 *
 * // Checking if tracking is active
 * if (trackingContext.getCurrent()) {
 *   // Register this atom as a dependency
 * }
 * ```
 */
export const trackingContext: TrackingContext = {
  /** @inheritdoc */
  current: null,

  /**
   * @inheritdoc
   * @throws Re-throws any error from the executed function after restoring context
   */
  run<T>(listener: Listener, fn: () => T): T {
    const prev = this.current;
    this.current = listener;
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  },

  /** @inheritdoc */
  getCurrent(): Listener | null {
    return this.current;
  },
};
