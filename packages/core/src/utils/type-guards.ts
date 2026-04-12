import { BRAND, BrandFlags } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Internal helper to check for a brand flag on objects or functions.
 * Optimized for high-performance bitwise identification.
 */
function isBranded<T>(obj: unknown, flag: number): obj is T {
  if (!obj) return false;
  const type = typeof obj;
  return (
    (type === 'object' || type === 'function') &&
    // Bitwise AND check on the consolidated BRAND symbol
    !!(((obj as Record<symbol, number>)[BRAND] ?? 0) & flag)
  );
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
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  if (value instanceof Promise) return true;
  if (!value) return false;
  const type = typeof value;
  return (
    (type === 'object' || type === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
