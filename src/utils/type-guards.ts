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
