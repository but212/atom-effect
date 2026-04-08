import { ATOM_BRAND, COMPUTED_BRAND, EFFECT_BRAND, WRITABLE_BRAND } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Internal check for objects or functions that can have brands or thenable.
 */
function isObject(val: unknown): val is object {
  return val !== null && (typeof val === 'object' || typeof val === 'function');
}

/**
 * Readonly atom check.
 *
 * @param obj - Object to check.
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return isObject(obj) && ATOM_BRAND in obj;
}

/**
 * Writable atom check.
 *
 * Uses a dedicated positive brand instead of `!isComputed()` to remain
 * correct if new ReadonlyAtom-style primitives are added in the future.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isObject(obj) && WRITABLE_BRAND in obj;
}

/**
 * Computed atom check.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isObject(obj) && COMPUTED_BRAND in obj;
}

/**
 * Effect object check.
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return isObject(obj) && EFFECT_BRAND in obj;
}

/**
 * Promise check.
 *
 * Checks if the value is "Thenable" (has a .then method).
 * Supports both function-based and object-based Promises.
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return isObject(value) && typeof (value as { then?: unknown }).then === 'function';
}
