/**
 * Array pool for reusing temporarily allocated arrays to avoid GC pressure.
 * Ported from @but212/atom-effect core.
 *
 * @template T - Element type.
 */
export class ArrayPool<T> {
  private readonly pool: T[][] = [];

  constructor(
    private readonly limit = 50,
    private readonly capacity = 256
  ) {}

  /** Acquires array from pool or returns a new one. */
  acquire(): T[] {
    return this.pool.pop() ?? [];
  }

  /** Releases array back to pool if within capacity and limit. */
  release(arr: T[]): void {
    if (arr.length > this.capacity || this.pool.length >= this.limit || Object.isFrozen(arr))
      return;
    arr.length = 0;
    this.pool.push(arr);
  }

  /** Clears the pool. */
  reset(): void {
    this.pool.length = 0;
  }
}
