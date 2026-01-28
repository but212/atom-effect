import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types';

/**
 * A type-safe array pool for recycling array instances.
 *
 * Reduces GC pressure and improves cache locality using a LIFO strategy.
 * Limits array capacity and pool size to prevent excessive memory usage.
 *
 * @template T - The type of elements in the pooled arrays.
 */
export class ArrayPool<T> {
  private readonly pool: T[][] = [];

  // Mutable stats container, null in production
  private stats = IS_DEV
    ? {
        acquired: 0,
        released: 0,
        rejected: { frozen: 0, tooLarge: 0, poolFull: 0 },
      }
    : null;

  /**
   * @param limit - Max unique arrays to hold (default: 50). Prevents the pool itself from consuming too much memory.
   * @param capacity - Max length of an array to accept (default: 256). prevents preventing holding onto massive backing buffers.
   */
  constructor(
    private readonly limit = 50,
    private readonly capacity = 256
  ) {}

  /**
   * Acquires an array from the pool or creates a new one.
   */
  acquire(): T[] {
    if (IS_DEV && this.stats) {
      this.stats.acquired++;
    }
    // LIFO reuse for better cache locality
    return this.pool.pop() ?? [];
  }

  /**
   * Releases an array back to the pool.
   * Resets length to 0 before storage.
   *
   * @param arr - The array to release.
   * @param emptyConst - Optional reference to a global empty iterator/constant to ignore.
   */
  release(arr: T[], emptyConst?: readonly T[]): void {
    if (emptyConst && arr === emptyConst) return;

    if (arr.length > this.capacity) {
      if (IS_DEV && this.stats) this.stats.rejected.tooLarge++;
      return;
    }

    if (this.pool.length >= this.limit) {
      if (IS_DEV && this.stats) this.stats.rejected.poolFull++;
      return;
    }

    if (Object.isFrozen(arr)) {
      if (IS_DEV && this.stats) this.stats.rejected.frozen++;
      return;
    }

    arr.length = 0;
    this.pool.push(arr);

    if (IS_DEV && this.stats) {
      this.stats.released++;
    }
  }

  /**
   * Returns generic pool statistics.
   * Always returns null in production.
   */
  getStats(): PoolStats | null {
    if (!IS_DEV || !this.stats) return null;

    const { acquired, released, rejected } = this.stats;
    const leakCount =
      acquired - released - (rejected.frozen + rejected.tooLarge + rejected.poolFull);

    return {
      acquired,
      released,
      rejected: { ...rejected },
      leaked: leakCount,
      poolSize: this.pool.length,
    };
  }

  /**
   * Hard resets the pool, dropping all references.
   * Useful for cleanup between tests or large operation phases.
   */
  reset(): void {
    this.pool.length = 0;
    if (IS_DEV && this.stats) {
      this.stats = {
        acquired: 0,
        released: 0,
        rejected: { frozen: 0, tooLarge: 0, poolFull: 0 },
      };
    }
  }
}
