/** Internal scheduler interface to break circular dependencies. */
export interface IScheduler<T> {
  markDirty(atom: T): void;
  scheduleNotify(atom: T): void;
}

/** Internal atom interface for core library usage. */
export interface IAtom {
  /** Numerical ID for the node. */
  readonly id: number;
  /** Current version of the node's value. */
  version: number;
  /** Internal method to trigger subscriber notifications. */
  _internalNotifySubscribers(): void;
  /** Internal method to trigger recomputation. */
  recompute?(): void;
}

/** Statistics for pool usage and health. */
export interface PoolStats {
  /** Number of items acquired from the pool. */
  acquired: number;
  /** Number of items released back to the pool. */
  released: number;
  /** Details for items that could not be returned to the pool. */
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  /** Approximate number of items that have leaked (not released or rejected). */
  leaked: number;
  /** Current number of items available in the pool. */
  poolSize: number;
}
