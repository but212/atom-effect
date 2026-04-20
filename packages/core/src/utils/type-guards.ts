import { BRAND, BrandFlags } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/** @internal */
interface Branded {
  [BRAND]?: number;
}

/** @internal */
interface Thenable {
  then: unknown;
}

/**
 * Internal helper to check for a brand flag on objects or functions.
 * Optimized for high-performance bitwise identification.
 */
function isBranded<T>(obj: unknown, flag: number): obj is T {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;

  // Bitwise AND check on the consolidated BRAND symbol
  return !!((obj as Branded)[BRAND]! & flag);
}

/**
 * Readonly atom check.
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return isBranded(obj, BrandFlags.Atom);
}

/**
 * Writable atom check.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isBranded(obj, BrandFlags.Writable);
}

/**
 * Computed atom check.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isBranded(obj, BrandFlags.Computed);
}

/**
 * Effect object check.
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return isBranded(obj, BrandFlags.Effect);
}

/**
 * Promise check.
 * Includes a fast-path for native Promises and supports duck-typed thenables.
 * Optimized for non-promise dominance by providing an eager-exit for primitives.
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  // 1. Fast-path for native promises
  if (value instanceof Promise) return true;

  // 2. Eager-exit for primitives and null to avoid property indexing
  if (value === null || typeof value !== 'object') return false;

  // 3. Duck-typed thenable (supports 3rd party libs)
  return typeof (value as Thenable).then === 'function';
}
