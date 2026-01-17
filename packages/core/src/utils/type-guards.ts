import type {
  DependencySubscriber,
  ExecutableSubscriber,
  TrackableFunction,
} from '@/tracking/tracking.types';
import type { ComputedAtom, EffectObject, ReadonlyAtom } from '@/types';
import { debug } from './debug';

/** Checks if the given object is a ReadonlyAtom. */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    'subscribe' in obj &&
    typeof (obj as Record<string, unknown>).subscribe === 'function'
  );
}

/** Checks if the given object is a ComputedAtom. */
export function isComputed(obj: unknown): obj is ComputedAtom {
  if (debug.enabled && (obj === null || obj === undefined || typeof obj === 'object')) {
    const debugType = debug.getDebugType(obj);
    if (debugType) {
      return debugType === 'computed';
    }
  }
  return (
    isAtom(obj) &&
    'invalidate' in obj &&
    typeof (obj as Record<string, unknown>).invalidate === 'function'
  );
}

/** Checks if the given object is an EffectObject. */
export function isEffect(obj: unknown): obj is EffectObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'dispose' in obj &&
    'run' in obj &&
    typeof (obj as Record<string, unknown>).dispose === 'function' &&
    typeof (obj as Record<string, unknown>).run === 'function'
  );
}

/**
 * Type guard to check if a value is a Promise
 *
 * Uses duck-typing to detect Promise-like objects by checking for
 * the presence of a `then` method.
 *
 * @template T - The type the Promise resolves to
 * @param value - Value to check
 * @returns True if value has a `then` method (is Promise-like)
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return value != null && typeof (value as { then?: unknown }).then === 'function';
}

/** Internal guard to verify if a value is a non-null object. */
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Checks if the value implements the {@link DependencySubscriber} interface. */
export function hasDependencyMethod(value: unknown): value is DependencySubscriber {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as DependencySubscriber).addDependency === 'function'
  );
}

/** Checks if the value is a function with an `addDependency` method. */
export function isTrackableFunction(
  value: unknown
): value is TrackableFunction & DependencySubscriber {
  return (
    typeof value === 'function' && typeof (value as TrackableFunction).addDependency === 'function'
  );
}

/** Checks if the value is a plain function without dependency tracking capabilities. */
export function isPlainListener(value: unknown): value is () => void {
  return (
    typeof value === 'function' && typeof (value as TrackableFunction).addDependency !== 'function'
  );
}

/** Checks if the value implements the {@link ExecutableSubscriber} interface. */
export function hasExecuteMethod(value: unknown): value is ExecutableSubscriber {
  return isNonNullObject(value) && typeof value.execute === 'function';
}
