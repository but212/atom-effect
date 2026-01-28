import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Readonly atom check.
 *
 * @param obj - Object to check.
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
 * Writable atom check.
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isAtom(obj) && typeof (obj as { dispose?: unknown }).dispose === 'function';
}

/**
 * Computed atom check.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isAtom(obj) && typeof (obj as { invalidate?: unknown }).invalidate === 'function';
}

/**
 * Effect object check.
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
 * Promise check.
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
