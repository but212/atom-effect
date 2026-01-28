import type { Listener } from './tracking.types';

/**
 * Global tracking context.
 */
export const trackingContext = {
  /** Active listener. */
  current: null as Listener | null,

  /**
   * Executes in context.
   *
   * @param listener - The subscriber.
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
 * Tracking context type.
 */
export type ITrackingContext = typeof trackingContext;
