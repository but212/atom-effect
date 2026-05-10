import { COMPUTED_STATE_FLAGS } from '@/constants';
import { isBufferDirty, isBufferShallowDirty } from '@/core/buffers';
import type { Dependency, MergedDependencyValue, ReactiveNode } from '@/types';

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
export { isAtom, isComputed, isEffect, isPromise, isWritable } from './type-guards';

export function nodeIsDisposed<T>(node: ReactiveNode<T>): boolean {
  return (node.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0;
}

export function nodeIsComputed<T>(node: ReactiveNode<T>): boolean {
  return (node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0;
}

export function nodeIsNotifying<T>(node: ReactiveNode<T>): boolean {
  return node._storage.slots?.isLocked ?? false;
}

export function nodeSubscriberCount<T>(node: ReactiveNode<T>): number {
  return node._storage.slots?.size ?? 0;
}

export function nodeIsDirty<T>(node: ReactiveNode<T>): boolean {
  const deps = node._storage.deps;
  return deps !== null && isBufferDirty(deps);
}

export function nodeIsShallowDirty<T>(node: ReactiveNode<T>): boolean {
  const deps = node._storage.deps;
  return deps !== null && isBufferShallowDirty(deps);
}
