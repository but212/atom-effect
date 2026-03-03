/**
 * Array pool for reusing temporarily allocated arrays to avoid GC pressure.
 * Ported from @but212/atom-effect core.
 *
 * @template T - Element type.
 */
export class ArrayPool<T> {
  private readonly pool: T[][] = [];

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
    // LIFO reuse for better cache locality
    return this.pool.pop() ?? [];
  }

  /**
   * Releases array.
   *
   * @param arr - Array to release.
   */
  release(arr: T[]): void {
    if (arr.length > this.capacity) {
      return;
    }

    if (this.pool.length >= this.limit) {
      return;
    }

    if (Object.isFrozen(arr)) {
      return;
    }

    arr.length = 0;
    this.pool.push(arr);
  }

  /**
   * Resets pool.
   */
  reset(): void {
    this.pool.length = 0;
  }
}
