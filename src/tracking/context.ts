import type { Listener } from './tracking.types';

export interface TrackingContext {
  current: Listener | null;
  run<T>(listener: Listener, fn: () => T): T;
  getCurrent(): Listener | null;
}

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
