/**
 * @module Utils
 *
 * Responsibility:
 * Aggregates diagnostic, error-handling, and type-guard utilities.
 * Provides internal helpers for multi-dependency state merging.
 */

import { SMI_MAX } from '@/constants';
import type { Dependency, MergedDependencyValue } from '@/types';

/**
 * Optimization: SMI-safe Arithmetic
 * Why: Wraps integers to stay within V8's 31-bit signed range (SMI) to avoid
 * heap allocation and maintain high-performance object property access.
 * @internal
 */
export const nextSmi = (value: number): number => {
  const next = (value + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
};

/**
 * Role: Aggregates the values of multiple object-based atoms into a single snapshot.
 *
 * Logic: Performs a shallow merge using `Object.assign`. If multiple atoms
 * contain the same key, the value from the last atom in the array takes precedence.
 *
 * @param atoms List of reactive dependencies to merge.
 * @param peek Constraint: If true, uses `.peek()` to prevent the caller from
 * tracking these dependencies (e.g., during non-reactive initialization).
 *
 * @internal
 */
export function mergeAtomValues<T extends Dependency<unknown>[]>(
  atoms: T,
  peek = false
): MergedDependencyValue<T> {
  const mergedResult = {} as MergedDependencyValue<T>;

  for (let i = 0; i < atoms.length; i++) {
    const value = peek ? atoms[i]?.peek() : atoms[i]?.value;
    if (value != null && typeof value === 'object') {
      Object.assign(mergedResult, value);
    } else if (value != null) {
      (mergedResult as Record<string, unknown>)[i] = value;
    }
  }

  return mergedResult;
}

export { NO_DEFAULT_VALUE } from '@/constants';
export { debug, generateId } from './debug';
export {
  AtomError,
  ComputedError,
  EffectError,
  type ErrorMetadata,
  getErrorChain,
  getErrorMetadata,
  SchedulerError,
  serializeError,
  wrapError,
} from './errors';
export { isAtom, isComputed, isEffect, isError, isPromise, isWritable } from './type-guards';
