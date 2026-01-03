export const __DEV__ = process.env.NODE_ENV !== 'production';

// Scheduler & Atom interfaces to prevent circular deps
export interface IScheduler {
  markDirty(atom: any): void;
  scheduleNotify(atom: any): void;
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
