import type { DependencySubscriber } from './tracking.types';

/**
 * Tracking context implementation.
 */
class TrackingContext {
  /** Active subscriber. */
  public current: DependencySubscriber | null = null;

  /**
   * Executes in context.
   *
   * @param subscriber - The subscriber.
   * @param fn - The logic to execute.
   * @returns The result of `fn`.
   */
  public run<T>(subscriber: DependencySubscriber, fn: () => T): T {
    if (this.current === subscriber) {
      return fn();
    }
    const prev = this.current;
    this.current = subscriber;
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
export type { TrackingContext };
