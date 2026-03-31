import type { Listener } from './tracking.types';

/**
 * Tracking context implementation.
 */
class TrackingContext {
  /** Active listener. */
  public current: Listener | null = null;

  /**
   * Executes in context.
   *
   * @param listener - The subscriber.
   * @param fn - The logic to execute.
   * @returns The result of `fn`.
   */
  public run<T>(listener: Listener, fn: () => T): T {
    const prev = this.current;
    this.current = listener;
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  }
}

/**
 * Global tracking context singleton.
 */
export const trackingContext = new TrackingContext();

/**
 * Tracking context type.
 */
export type ITrackingContext = TrackingContext;
