import { IS_DEV } from '@/constants';
import type { Dependency, Subscriber } from '@/types';
import type { PoolStats } from '@/types/internal';

// Shared Constants
export const EMPTY_DEPS = Object.freeze([]) as unknown as Dependency[];
export const EMPTY_SUBS = Object.freeze([]) as unknown as Subscriber[];
export const EMPTY_UNSUBS = Object.freeze([]) as unknown as (() => void)[];

export const EMPTY_VERSIONS = Object.freeze([]) as unknown as number[];

/**
 * Generic Array Pool (Type-safe pooling for different array types)
 */
class ArrayPool<T> {
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

  acquire(): T[] {
    if (IS_DEV && this.stats) this.stats.acquired++;
    return this.pool.pop() ?? [];
  }

  release(arr: T[], emptyConst?: readonly T[]): void {
    // 1. Reference check first
    if (emptyConst && arr === emptyConst) return;

    // 2. Frozen check
    if (Object.isFrozen(arr)) {
      if (IS_DEV && this.stats) this.stats.rejected.frozen++;
      return;
    }

    // 3. Size check
    if (arr.length > this.maxReusableCapacity) {
      if (IS_DEV && this.stats) this.stats.rejected.tooLarge++;
      return;
    }

    // 4. Pool capacity check
    if (this.pool.length >= this.maxPoolSize) {
      if (IS_DEV && this.stats) this.stats.rejected.poolFull++;
      return;
    }

    // 5. Normal release
    arr.length = 0;
    this.pool.push(arr);
    if (IS_DEV && this.stats) this.stats.released++;
  }

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

  reset(): void {
    this.pool.length = 0;
    if (IS_DEV && this.stats) {
      this.stats.acquired = 0;
      this.stats.released = 0;
      this.stats.rejected = { frozen: 0, tooLarge: 0, poolFull: 0 };
    }
  }
}

// Per-type Pool Instances (V8 Shape Optimization)
export const depArrayPool = new ArrayPool<Dependency>();
export const subArrayPool = new ArrayPool<Subscriber>();
export const unsubArrayPool = new ArrayPool<() => void>();
export const versionArrayPool = new ArrayPool<number>();
