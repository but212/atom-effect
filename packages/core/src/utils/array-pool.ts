import { IS_DEV } from '@/constants';
import type { PoolStats } from '@/types';

/** Generic Array Pool with type-safe pooling and dev-mode stats. */
export class ArrayPool<T> {
  private pool: T[][] = [];
  private readonly limit = 50;
  private readonly capacity = 256;

  private stats = IS_DEV
    ? {
        acquired: 0,
        released: 0,
        rejected: { frozen: 0, tooLarge: 0, poolFull: 0 },
      }
    : null;

  acquire(): T[] {
    if (this.stats) this.stats.acquired++;
    return this.pool.pop() ?? [];
  }

  release(arr: T[], emptyConst?: readonly T[]): void {
    if (emptyConst && arr === emptyConst) return;

    const stats = this.stats;
    // Check constraints first (cheaper than isFrozen)
    if (arr.length > this.capacity) {
      if (stats) stats.rejected.tooLarge++;
      return;
    }
    if (this.pool.length >= this.limit) {
      if (stats) stats.rejected.poolFull++;
      return;
    }
    // Expensive check last
    if (Object.isFrozen(arr)) {
      if (stats) stats.rejected.frozen++;
      return;
    }

    arr.length = 0;
    this.pool.push(arr);
    if (stats) stats.released++;
  }

  getStats(): PoolStats | null {
    if (!this.stats) return null;
    const { acquired, released, rejected } = this.stats;
    return {
      acquired,
      released,
      rejected: { ...rejected },
      leaked: acquired - released - (rejected.frozen + rejected.tooLarge + rejected.poolFull),
      poolSize: this.pool.length,
    };
  }

  reset(): void {
    this.pool.length = 0;
    if (this.stats) {
      this.stats = {
        acquired: 0,
        released: 0,
        rejected: { frozen: 0, tooLarge: 0, poolFull: 0 },
      };
    }
  }
}
