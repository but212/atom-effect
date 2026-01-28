import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types';

/**
 * Array pool.
 *
 * @template T - Element type.
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
   * @param capacity - Max length of an array to accept (default: 256).
   */
  constructor(
    private readonly limit = 50,
    private readonly capacity = 256
  ) {}

  /**
   * Acquires array.
   */
  acquire(): T[] {
    if (IS_DEV && this.stats) {
      this.stats.acquired++;
    }
    // LIFO reuse for better cache locality
    return this.pool.pop() ?? [];
  }

  /**
   * Releases array.
   *
   * @param arr - Array to release.
   * @param emptyConst - Optional empty constant.
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
   * Pool stats.
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
   * Resets pool.
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
