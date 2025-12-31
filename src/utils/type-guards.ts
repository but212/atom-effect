import type { ComputedAtom, EffectObject, ReadonlyAtom } from '../types';
import { debug } from './debug';

export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    'subscribe' in obj &&
    typeof (obj as Record<string, unknown>).subscribe === 'function'
  );
}

export function isComputed(obj: unknown): obj is ComputedAtom {
  if (debug.enabled) {
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
