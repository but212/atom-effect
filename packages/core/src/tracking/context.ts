import type { Listener } from './tracking.types';

/**
 * The Global Tracking Context.
 *
 * When an Atom is read, it peeks at `trackingContext.current`. If present,
 * it registers a dependency calculation link.
 */
export const trackingContext = {
  /**
   * The currently active listener (computational sink).
   * @internal - Direct access is allowed for performance in hot paths (Atoms),
   * but generally `run` or `untracked` should be used to manage this.
   */
  current: null as Listener | null,

  /**
   * Executes a function within the scope of a specific listener.
   * This pushes the listener onto the "stack" (via call stack recursion), runs the function,
   * and then restores the previous listener.
   *
   * @param listener - The subscriber (Effect or Computed) that will depend on atoms read during `fn`.
   * @param fn - The logic to execute.
   * @returns The result of `fn`.
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
};

/**
 * Type alias for the inferred type of the tracking context,
 * useful if we ever need to mock it for testing.
 */
export type ITrackingContext = typeof trackingContext;
