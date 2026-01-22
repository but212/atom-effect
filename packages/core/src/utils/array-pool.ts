import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types';

/**
 * Generic Array Pool.
 * Provides type-safe pooling for different array types to reduce GC pressure.
 * Supports capacity limits and stats tracking in development mode.
 */
export class ArrayPool<T> {
  private pool: T[][] = [];
  private readonly maxPoolSize = 50;
  private readonly maxReusableCapacity = 256;

  private stats = IS_DEV
    ? {
        acquired: 0,
        released: 0,
        rejected: { frozen: 0, tooLarge: 0, poolFull: 0 },
      }
    : null;

  /** Acquires an array from the pool or creates a new one if the pool is empty. */
  acquire(): T[] {
    if (IS_DEV && this.stats) this.stats.acquired++;
    return this.pool.pop() ?? [];
  }

  /**
   * Releases an array back to the pool.
   * Clears the array before storing it.
   */
  release(arr: T[], emptyConst?: readonly T[]): void {
    // 1. Skip if empty constant or frozen (expensive check)
    if ((emptyConst && arr === emptyConst) || Object.isFrozen(arr)) {
      if (IS_DEV && this.stats && arr !== emptyConst) this.stats.rejected.frozen++;
      return;
    }

    // 2. Reject based on capacity or pool size
    const len = arr.length;
    const poolLen = this.pool.length;
    
    if (len > this.maxReusableCapacity || poolLen >= this.maxPoolSize) {
      if (IS_DEV && this.stats) {
        if (len > this.maxReusableCapacity) this.stats.rejected.tooLarge++;
        else this.stats.rejected.poolFull++;
      }
      return;
    }

    // 3. Clear and store
    arr.length = 0;
    this.pool.push(arr);
    if (IS_DEV && this.stats) this.stats.released++;
  }

  /** Returns current stats for the pool (dev mode only). */
  getStats(): PoolStats | null {
    if (!IS_DEV || !this.stats) return null;
    const { acquired, released, rejected } = this.stats;
    const totalRejected = rejected.frozen + rejected.tooLarge + rejected.poolFull;
    return {
      acquired,
      released,
      rejected,
      leaked: acquired - released - totalRejected,
      poolSize: this.pool.length,
    };
  }

  /** Resets the pool and its stats. */
  reset(): void {
    this.pool.length = 0;
    if (IS_DEV && this.stats) {
      this.stats.acquired = 0;
      this.stats.released = 0;
      this.stats.rejected = { frozen: 0, tooLarge: 0, poolFull: 0 };
    }
  }
}
