import { ATOM_BRAND, COMPUTED_BRAND, EFFECT_BRAND, WRITABLE_BRAND } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Readonly atom check.
 *
 * @param obj - Object to check.
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return typeof obj === 'object' && obj !== null && ATOM_BRAND in obj;
}

/**
 * Writable atom check.
 *
 * Uses a dedicated positive brand instead of `!isComputed()` to remain
 * correct if new ReadonlyAtom-style primitives are added in the future.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return typeof obj === 'object' && obj !== null && WRITABLE_BRAND in obj;
}

/**
 * Computed atom check.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return typeof obj === 'object' && obj !== null && COMPUTED_BRAND in obj;
}

/**
 * Effect object check.
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return typeof obj === 'object' && obj !== null && EFFECT_BRAND in obj;
}

/**
 * Promise check.
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
