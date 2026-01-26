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
    if (this.stats) this.stats.acquired++;
    return this.pool.pop() ?? [];
  }

  /**
   * Releases an array back to the pool.
   * Clears the array before storing it.
   */
  release(arr: T[], emptyConst?: readonly T[]): void {
    // 1. Skip if empty constant or frozen (expensive check)
    if ((emptyConst && arr === emptyConst) || Object.isFrozen(arr)) {
      if (this.stats && arr !== emptyConst) this.stats.rejected.frozen++;
      return;
    }

    // 2. Reject based on capacity or pool size
    if (arr.length > this.maxReusableCapacity || this.pool.length >= this.maxPoolSize) {
      if (this.stats) {
        if (arr.length > this.maxReusableCapacity) this.stats.rejected.tooLarge++;
        else this.stats.rejected.poolFull++;
      }
      return;
    }

    // 3. Clear and store
    arr.length = 0;
    this.pool.push(arr);
    if (this.stats) this.stats.released++;
  }

  /** Returns current stats for the pool (dev mode only). */
  getStats(): PoolStats | null {
    if (!this.stats) return null;
    const { acquired, released, rejected } = this.stats;
    return {
      acquired,
      released,
      rejected: {
        frozen: rejected.frozen,
        tooLarge: rejected.tooLarge,
        poolFull: rejected.poolFull,
      },
      leaked: acquired - released - (rejected.frozen + rejected.tooLarge + rejected.poolFull),
      poolSize: this.pool.length,
    };
  }

  /** Resets the pool and its stats. */
  reset(): void {
    this.pool.length = 0;
    if (this.stats) {
      this.stats.acquired = 0;
      this.stats.released = 0;
      this.stats.rejected.frozen = 0;
      this.stats.rejected.tooLarge = 0;
      this.stats.rejected.poolFull = 0;
    }
  }
}
