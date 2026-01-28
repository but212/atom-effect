import type { ComputedAtom, EffectObject, ReadonlyAtom } from '@/types';
import { debug } from './debug';

/**
 * Checks if the given object conforms to the ReadonlyAtom interface.
 * Verifies existence of `value` property and `subscribe` method.
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
 * Checks if the given object is a ComputedAtom.
 * Verifies it tracks dependencies and has an `invalidate` method.
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  if (debug.enabled && obj != null && typeof obj === 'object') {
    if (debug.getDebugType(obj) === 'computed') return true;
  }
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
 * Type guard to check if a value is a Promise
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return value != null && typeof (value as { then?: unknown }).then === 'function';
}
