import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types/internal';

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
   * @param arr - The array to release.
   * @param emptyConst - Optional reference to a constant empty array to skip.
   */
  release(arr: T[], emptyConst?: readonly T[]): void {
    if (emptyConst && arr === emptyConst) return;

    if (Object.isFrozen(arr)) {
      if (IS_DEV && this.stats) this.stats.rejected.frozen++;
      return;
    }

    if (arr.length > this.maxReusableCapacity) {
      if (IS_DEV && this.stats) this.stats.rejected.tooLarge++;
      return;
    }

    if (this.pool.length >= this.maxPoolSize) {
      if (IS_DEV && this.stats) this.stats.rejected.poolFull++;
      return;
    }

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
