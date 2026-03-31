/**
 * Generic object pool for reusing fixed-shape plain objects.
 *
 * Design constraints:
 * - Pooled objects MUST have a fixed property shape (monomorphic).
 *   Mixing shapes in a single pool will de-optimize V8's hidden classes.
 * - The `reset` callback MUST restore the object to a clean, reusable state.
 *   Failing to do so leaks stale references and causes subtle bugs.
 * - The pool is LIFO (stack) for better CPU cache locality.
 *
 * @template T - Object type to pool. Must be a plain object with a fixed shape.
 */
export class ObjectPool<T extends object> {
  private readonly pool: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset: (obj: T) => void,
    private readonly limit = 64
  ) {}

  /** Acquires object from pool or creates a new one. */
  acquire(): T {
    return this.pool.pop() ?? this.factory();
  }

  /** Releases object back to pool after reset. */
  release(obj: T): void {
    if (this.pool.length < this.limit) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  /** Drains all retained objects. */
  drain(): void {
    if (this.pool.length > 0) {
      this.pool.length = 0;
    }
  }

  get size(): number {
    return this.pool.length;
  }
}
