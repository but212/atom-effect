// Security: Guard against undefined process in browser environments
export const __DEV__ = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

// Scheduler & Atom interfaces to prevent circular deps
export interface IScheduler<T> {
  markDirty(atom: T): void;
  scheduleNotify(atom: T): void;
}

export interface IAtom {
  readonly id: number;
  version: number;
  _internalNotifySubscribers(): void;
  recompute?(): void;
}

export interface PoolStats {
  acquired: number;
  released: number;
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}
