import { ATOM_BRAND, COMPUTED_BRAND, EFFECT_BRAND } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Readonly atom check.
 *
 * @param obj - Object to check.
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return obj !== null && typeof obj === 'object' && ATOM_BRAND in obj;
}

/**
 * Writable atom check.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isAtom(obj) && !isComputed(obj);
}

/**
 * Computed atom check.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return obj !== null && typeof obj === 'object' && COMPUTED_BRAND in obj;
}

/**
 * Effect object check.
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return obj !== null && typeof obj === 'object' && EFFECT_BRAND in obj;
}

/**
 * Promise check.
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
