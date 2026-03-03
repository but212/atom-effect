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

  /**
   * @param factory - Creates a new object with the canonical shape.
   *   Called when the pool is empty and `acquire()` is invoked.
   * @param reset  - Resets a used object to its clean initial state before
   *   it is returned to the pool. All mutable fields should be zeroed /
   *   set to `undefined` / cleared.
   * @param limit  - Maximum number of objects to retain (default: 64).
   *   Prevents the pool from growing unbounded if a burst of objects
   *   are released at once.
   */
  constructor(
    private readonly factory: () => T,
    private readonly reset: (obj: T) => void,
    private readonly limit = 64
  ) {}

  /**
   * Acquires an object from the pool or creates a new one.
   * The returned object is in a clean state (either freshly created or reset).
   */
  acquire(): T {
    return this.pool.pop() ?? this.factory();
  }

  /**
   * Releases an object back to the pool after resetting it.
   * If the pool is already at capacity the object is simply discarded (GC'd).
   *
   * @param obj - The object to release.
   */
  release(obj: T): void {
    if (this.pool.length >= this.limit) return;
    this.reset(obj);
    this.pool.push(obj);
  }

  /**
   * Drains the pool, releasing all retained objects for GC.
   */
  drain(): void {
    this.pool.length = 0;
  }

  /**
   * Current number of objects retained in the pool.
   */
  get size(): number {
    return this.pool.length;
  }
}
