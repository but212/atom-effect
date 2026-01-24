import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types';

/** @internal */
class PoolStatsCollector {
  acquired = 0;
  released = 0;
  rejected = new PoolStatsRejected();
}

/** @internal */
class PoolStatsRejected {
  frozen = 0;
  tooLarge = 0;
  poolFull = 0;
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
    if (IS_DEV && stats) stats.acquired++;
    return this.pool.pop() ?? [];
  }

  /**
   * Releases an array back to the pool.
   * Clears the array before storing it.
   */
  release(arr: T[], emptyConst?: readonly T[]): void {
    // 1. Skip if empty constant or frozen (expensive check)
    if ((emptyConst && arr === emptyConst) || Object.isFrozen(arr)) {
      const stats = this.stats;
      if (IS_DEV && stats && arr !== emptyConst) stats.rejected.frozen++;
      return;
    }

    // 2. Reject based on capacity or pool size
    const len = arr.length;
    const pool = this.pool;
    const poolLen = pool.length;

    if (len > this.maxReusableCapacity || poolLen >= this.maxPoolSize) {
      const stats = this.stats;
      if (IS_DEV && stats) {
        if (len > this.maxReusableCapacity) stats.rejected.tooLarge++;
        else stats.rejected.poolFull++;
      }
      return;
    }

    // 3. Clear and store
    arr.length = 0;
    pool.push(arr);
    const stats = this.stats;
    if (IS_DEV && stats) stats.released++;
  }

  /** Returns current stats for the pool (dev mode only). */
  getStats(): PoolStats | null {
    const stats = this.stats;
    if (!IS_DEV || !stats) return null;
    const { acquired, released, rejected } = stats;
    const totalRejected = rejected.frozen + rejected.tooLarge + rejected.poolFull;
    return {
      acquired,
      released,
      rejected: {
        frozen: rejected.frozen,
        tooLarge: rejected.tooLarge,
        poolFull: rejected.poolFull,
      },
      leaked: acquired - released - totalRejected,
      poolSize: this.pool.length,
    };
  }

  /** Resets the pool and its stats. */
  reset(): void {
    this.pool.length = 0;
    const stats = this.stats;
    if (IS_DEV && stats) {
      stats.acquired = 0;
      stats.released = 0;
      stats.rejected.frozen = 0;
      stats.rejected.tooLarge = 0;
      stats.rejected.poolFull = 0;
    }
  }
}
