import type { EffectObject } from '@/types';

// ============================================================================
// ArrayPool
// ============================================================================

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
    // Fast capacity check first to avoid frozen check cost
    if (arr.length > this.capacity || this.pool.length >= this.limit) return;
    if (Object.isFrozen(arr)) return;

    arr.length = 0;
    this.pool.push(arr);
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

// ============================================================================
// Specialized Pools
// ============================================================================

export const effectsArrayPool = new ArrayPool<EffectObject>();
export const cleanupsArrayPool = new ArrayPool<() => void>();

/**
 * Per-element record of all reactive resources that must be released on cleanup.
 * Fields are optional to avoid allocating arrays for the common case where only
 * one resource type is used.
 *
 * Extracted here so that both the pool and registry share the same type.
 */
export interface BindingRecord {
  effects: EffectObject[] | undefined;
  cleanups: Array<() => void> | undefined;
  componentCleanup: (() => void) | undefined;
}

/**
 * Pool for BindingRecord objects.
 * Uses a fixed hidden class for V8 optimization.
 */
export const bindingRecordPool = new ObjectPool<BindingRecord>(
  () => {
    return {
      effects: undefined,
      cleanups: undefined,
      componentCleanup: undefined,
    };
  },
  (r) => {
    r.effects = undefined;
    r.cleanups = undefined;
    r.componentCleanup = undefined;
  },
  128
);
