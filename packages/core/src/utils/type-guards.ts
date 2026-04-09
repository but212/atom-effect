import { ATOM_BRAND, COMPUTED_BRAND, EFFECT_BRAND, WRITABLE_BRAND } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Internal helper to check for a brand symbol on objects or functions.
 * Optimized to fail fast on null or primitives.
 */
function isBranded<T>(obj: unknown, brand: symbol): obj is T {
  if (!obj) return false;
  const type = typeof obj;
  return (type === 'object' || type === 'function') && brand in (obj as object);
}

/**
 * Readonly atom check.
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return isBranded(obj, ATOM_BRAND);
}

/**
 * Writable atom check.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isBranded(obj, WRITABLE_BRAND);
}

/**
 * Computed atom check.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isBranded(obj, COMPUTED_BRAND);
}

/**
 * Effect object check.
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return isBranded(obj, EFFECT_BRAND);
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
