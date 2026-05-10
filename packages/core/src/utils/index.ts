import type { Dependency, MergedDependencyValue } from '@/types';

/**
 * Merges the values of multiple object-based atoms into a single object.
 * @internal
 *
 * @param atoms - List of atoms to merge.
 * @param peek - If true, uses .peek() instead of .value to avoid reactive tracking.
 * @returns A single object containing all properties from the input atoms.
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

export { debug, generateId, NO_DEFAULT_VALUE } from './debug';
export type { AtomErrorJSON } from './errors';
export {
  AtomError,
  type AtomErrorConstructor,
  ComputedError,
  EffectError,
  ERROR_MESSAGES,
  SchedulerError,
  wrapError,
} from './errors';
export { isAtom, isComputed, isEffect, isPromise, isWritable } from './type-guards';
