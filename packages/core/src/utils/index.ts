/**
 * @module Utils
 *
 * Responsibility:
 * Aggregates diagnostic, error-handling, and type-guard utilities.
 * Provides internal helpers for multi-dependency state merging.
 */

import type { Dependency, MergedDependencyValue } from '@/types';

/**
 * Role: Aggregates the values of multiple object-based atoms into a single snapshot.
 *
 * Logic: Performs a shallow merge using `Object.assign`. If multiple atoms
 * contain the same key, the value from the last atom in the array takes precedence.
 *
 * @param atoms - List of reactive dependencies to merge.
 * @param peek - Constraint: If true, uses `.peek()` to prevent the caller from
 * tracking these dependencies (e.g., during non-reactive initialization).
 *
 * @internal
 */
export function mergeAtomValues<T extends Dependency<unknown>[]>(
  atoms: T,
  peek = false
): MergedDependencyValue<T> {
  const result = {} as MergedDependencyValue<T>;

  for (let i = 0; i < atoms.length; i++) {
    const val = peek ? atoms[i]!.peek() : atoms[i]!.value;
    if (val && typeof val === 'object') {
      Object.assign(result as object, val);
    }
  }

  return result;
}

export { NO_DEFAULT_VALUE } from '@/types';
export { debug, generateId } from './debug';
export {
  AtomError,
  ComputedError,
  EffectError,
  getErrorChain,
  SchedulerError,
  serializeError,
  wrapError,
} from './errors';
export { isAtom, isComputed, isEffect, isPromise, isWritable } from './type-guards';
