import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types';

/** @internal */
class PoolStatsRejected {
  frozen: number;
  tooLarge: number;
  poolFull: number;

  constructor() {
    this.frozen = 0;
    this.tooLarge = 0;
    this.poolFull = 0;
  }
}

/** @internal */
class PoolStatsCollector {
  acquired: number;
  released: number;
  rejected: PoolStatsRejected;

  constructor() {
    this.acquired = 0;
    this.released = 0;
    this.rejected = new PoolStatsRejected();
  }
}

/**
 * Generic Array Pool.
 * Provides type-safe pooling for different array types to reduce GC pressure.
 * Supports capacity limits and stats tracking in development mode.
 */
export class ArrayPool<T> {
  private pool: T[][];
  private readonly maxPoolSize: number;
  private readonly maxReusableCapacity: number;
  private stats: PoolStatsCollector | null;

  constructor() {
    this.pool = [];
    this.maxPoolSize = 50;
    this.maxReusableCapacity = 256;
    this.stats = IS_DEV ? new PoolStatsCollector() : null;
  }

  /** Acquires an array from the pool or creates a new one if the pool is empty. */
  acquire(): T[] {
    const stats = this.stats;
    if (stats) stats.acquired++;
    return this.pool.pop() ?? [];
  }

  /**
   * Releases an array back to the pool.
   * Clears the array before storing it.
   */
  release(arr: T[], emptyConst?: readonly T[]): void {
    const stats = this.stats;

    // 1. Skip if empty constant (identity check is very fast)
    if (emptyConst && arr === emptyConst) return;

    // 2. Accuracy check: Skip frozen arrays (prevent length manipulation errors)
    // Object.isFrozen is expensive, so it should be checked after ID checks
    if (Object.isFrozen(arr)) {
      if (stats) stats.rejected.frozen++;
      return;
    }

    // 3. Reject based on capacity or pool size
    if (arr.length > this.maxReusableCapacity) {
      if (stats) stats.rejected.tooLarge++;
      return;
    }

    const pool = this.pool;
    if (pool.length >= this.maxPoolSize) {
      if (stats) stats.rejected.poolFull++;
      return;
    }

    // 4. Clear and store
    arr.length = 0;
    pool.push(arr);
    if (stats) stats.released++;
  }

  /** Returns current stats for the pool (dev mode only). */
  getStats(): PoolStats | null {
    const stats = this.stats;
    if (!stats) return null;

    const { acquired, released, rejected } = stats;
    const { frozen, tooLarge, poolFull } = rejected;

    return {
      acquired,
      released,
      rejected: {
        frozen,
        tooLarge,
        poolFull,
      },
      leaked: acquired - released - (frozen + tooLarge + poolFull),
      poolSize: this.pool.length,
    };
  }

  /** Resets the pool and its stats. */
  reset(): void {
    this.pool.length = 0;
    const stats = this.stats;
    if (stats) {
      stats.acquired = 0;
      stats.released = 0;
      stats.rejected.frozen = 0;
      stats.rejected.tooLarge = 0;
      stats.rejected.poolFull = 0;
    }
  }
}
