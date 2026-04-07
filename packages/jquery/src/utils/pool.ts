import type { EffectObject } from '@/types';

// ============================================================================
// ArrayPool
// ============================================================================

/**
 * Array pool for reusing temporarily allocated arrays to avoid GC pressure.
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
    if (Object.isFrozen(arr)) return;

    const length = arr.length;
    // Always clear the array to help GC by breaking references,
    // even if it won't be stored in the pool.
    arr.length = 0;

    if (this.pool.length < this.limit && length <= this.capacity) {
      // Basic double-release protection. indexOf is O(N) but pool size is small (limit=50).
      if (this.pool.indexOf(arr) === -1) {
        this.pool.push(arr);
      }
    }
  }

  /** Clears the pool. */
  reset(): void {
    this.pool.length = 0;
  }
}

// ============================================================================
// ObjectPool
// ============================================================================

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
    if (Object.isFrozen(obj)) return;

    // Always reset the object to help GC by breaking references,
    // even if it won't be stored in the pool.
    this.reset(obj);

    if (this.pool.length < this.limit) {
      // Basic double-release protection. indexOf is O(N) but pool size is small (limit=64).
      if (this.pool.indexOf(obj) === -1) {
        this.pool.push(obj);
      }
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

// ============================================================================
// Specialized Pools
// ============================================================================

/** Limit synchronized with bindingRecordPool to ensure constituent arrays are also pooled. */
const SHARED_LIMIT = 128;

export const effectsArrayPool = new ArrayPool<EffectObject>(SHARED_LIMIT);
export const cleanupsArrayPool = new ArrayPool<() => void>(SHARED_LIMIT);

/**
 * Per-element record of all reactive resources that must be released on cleanup.
 * Fields are optional to avoid allocating arrays for the common case where only
 * one resource type is used.
 */
export interface BindingRecord {
  effects: EffectObject[] | undefined;
  cleanups: Array<() => void> | undefined;
  componentCleanup: (() => void) | undefined;
}

/**
 * Pool for BindingRecord objects.
 * Orchestrates constituent array pools during reset to prevent resource leaks.
 */
export const bindingRecordPool = new ObjectPool<BindingRecord>(
  () => ({
    effects: undefined,
    cleanups: undefined,
    componentCleanup: undefined,
  }),
  (r) => {
    // Orchestration: Return internal arrays to their respective pools.
    // registry.ts also does this, but keeping it here ensures safety if used elsewhere.
    if (r.effects) {
      effectsArrayPool.release(r.effects);
      r.effects = undefined;
    }
    if (r.cleanups) {
      cleanupsArrayPool.release(r.cleanups);
      r.cleanups = undefined;
    }
    r.componentCleanup = undefined;
  },
  SHARED_LIMIT
);
