import type { Listener } from './tracking.types';

/** Interface for the tracking context managing dependency collection */
export interface ITrackingContext {
  current: Listener | null;

  /** Executes fn within tracking context with given listener */
  run<T>(listener: Listener, fn: () => T): T;

  getCurrent(): Listener | null;
}

/**
 * Manages the active tracking context to identify dependencies during execution.
 */
export class TrackingContext implements ITrackingContext {
  current: Listener | null = null;

  /**
   * Runs the provided function within the context of the given listener.
   * Restores the previous context after the function completes or throws.
   *
   * @param listener - The tracking listener to associate with the current execution.
   * @param fn - The function to execute.
   */
  run<T>(listener: Listener, fn: () => T): T {
    const prev = this.current;
    this.current = listener;
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  }

  /**
   * Retrieves the listener currently associated with the tracking context.
   */
  getCurrent(): Listener | null {
    return this.current;
  }
}

/**
 * Global tracking context for dependency collection.
 * Atoms register as dependencies when accessed within a tracked context.
 */
export const trackingContext: TrackingContext = new TrackingContext();
