/**
 * @module ComputedErrors
 *
 * Responsibility:
 * Pure dependency-graph traversal that gathers errors from a computed and its computed dependencies.
 */

import { COMPUTED_STATE_FLAGS } from '@/constants';
import type { Dependency, DependencyId, ReactiveDependencyTracker } from '@/types';
import { BUFFER_FLAGS } from './buffers';

function isDependencyTracker(node: unknown): node is ReactiveDependencyTracker {
  return node != null && typeof node === 'object' && '_depSlots' in node;
}

export type ErrorTraversableNode = { id: DependencyId; flags: number; _error?: Error | null };

/**
 * Logic: Error Collection (Graph Traversal)
 * Crawls the dependency graph to collect errors while maintaining
 * a visited set to handle potential cycles or diamonds.
 * @internal
 */
export function collectErrorsRecursive(
  startNode: ErrorTraversableNode,
  stopOnFirst: boolean
): Error[] {
  const collected: Error[] = [];
  const seen = new Set<number>();

  const walk = (node: ErrorTraversableNode | Dependency): boolean => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);

    if (node._error) {
      collected.push(node._error);
      if (stopOnFirst) return true;
    }

    if (isDependencyTracker(node) && (node._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) !== 0) {
      const slots = node._depSlots;
      const slotsLength = slots.length;
      for (let i = 0; i < slotsLength; i++) {
        const dependencyLink = slots.at(i);
        if (
          dependencyLink &&
          (dependencyLink.node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0 &&
          walk(dependencyLink.node)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  walk(startNode);
  return collected;
}
