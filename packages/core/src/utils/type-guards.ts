import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Checks if the given object conforms to the ReadonlyAtom interface.
 *
 * @param obj - The object to inspect.
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    typeof (obj as { subscribe?: unknown }).subscribe === 'function'
  );
}

/**
 * Checks if the given object is a WritableAtom.
 * Extends `isAtom` check with `dispose` verification.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isAtom(obj) && typeof (obj as { dispose?: unknown }).dispose === 'function';
}

/**
 * Checks if the given object is a ComputedAtom.
 * Verifies it has an `invalidate` method in addition to atom properties.
 *
 * Note: We avoid relying on internal debug flags here to keep this pure and fast.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isAtom(obj) && typeof (obj as { invalidate?: unknown }).invalidate === 'function';
}

/**
 * Checks if the given object is an EffectObject.
 * Verifies existence of `dispose` and `run` methods.
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as { dispose?: unknown }).dispose === 'function' &&
    typeof (obj as { run?: unknown }).run === 'function'
  );
}

/**
 * Fast Promise check.
 * Adheres to Promises/A+ standard (checking for `then` method).
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
