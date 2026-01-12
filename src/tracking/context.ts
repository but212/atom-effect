import type { Listener } from './tracking.types';

/** Interface for the tracking context managing dependency collection */
export interface TrackingContext {
  current: Listener | null;

  /** Executes fn within tracking context with given listener */
  run<T>(listener: Listener, fn: () => T): T;

  getCurrent(): Listener | null;
}

/**
 * Global tracking context for dependency collection.
 * Atoms register as dependencies when accessed within a tracked context.
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
