/**
 * @module DependencyBuffers
 *
 * This module manages the state of dependency tracking during reactive evaluations.
 * It uses a linear SlotBuffer to store dependency links.
 */

import { COMPUTED_STATE_FLAGS, IS_DEV, LOG_PREFIX } from '@/constants';
import type { Dependency, DependencyLink, ReactiveDependencyTracker } from '@/types';
import { trackEvaluationFailure } from '@/utils/debug';
import { trackingContext, untracked } from './base';

/** @internal */
export const BUFFER_FLAGS = {
  NONE: 0,
  HAS_COMPUTEDS: 1 << 0,
} as const;

/** @internal */
export function prepareTracking(state: ReactiveDependencyTracker): void {
  refreshDepFlags(state);
}

/** @internal */
function refreshDepFlags(state: ReactiveDependencyTracker): void {
  let flags = state._depFlags & ~BUFFER_FLAGS.HAS_COMPUTEDS;
  const slots = state._depSlots;

  for (let i = 0, slotsLength = slots.length; i < slotsLength; i++) {
    const link = slots.at(i);
    if (link?.node.isComputed) {
      flags |= BUFFER_FLAGS.HAS_COMPUTEDS;
      break;
    }
  }

  state._depFlags = flags;
}

/**
 * Attempts to reuse an existing subscription for a dependency during re-evaluation.
 *
 * Why: Reusing links prevents unnecessary subscribe/unsubscribe cycles,
 * which are expensive and can cause "glitches" in the propagation graph.
 *
 * Logic: If the dependency is found at a different index, it performs a swap
 * to align the "active" dependencies at the start of the buffer.
 */
/** @internal */
export function claimExisting(
  state: ReactiveDependencyTracker,
  dependency: Dependency,
  trackIndex: number
): boolean {
  const slots = state._depSlots;
  if (slots.length <= trackIndex) return false;

  const current = slots.at(trackIndex);
  if (current?.node === dependency && current.unsubscribeCallback) {
    current.version = dependency.version;
    return true;
  }

  const existingIndex = findExistingIndex(state, dependency, trackIndex);
  if (existingIndex === -1) return false;

  const link = slots.at(existingIndex);
  if (!link) return false;
  link.version = dependency.version;

  const swappedLink = slots.at(trackIndex);

  // Reason: Swapping instead of splicing keeps the SlotBuffer size stable
  // and avoids O(n) array shifts during a tracking run.
  slots.setAt(trackIndex, link);
  slots.setAt(existingIndex, swappedLink);

  return true;
}

/**
 * Searches for a dependency in the buffer.
 */
function findExistingIndex(
  state: ReactiveDependencyTracker,
  dependency: Dependency,
  start: number
): number {
  const slots = state._depSlots;
  for (let i = start + 1, slotsLength = slots.length; i < slotsLength; i++) {
    const link = slots.at(i);
    if (link?.node === dependency && link.unsubscribeCallback) return i;
  }
  return -1;
}

/**
 * Inserts a new dependency at the current tracking index, pushing any existing
 * occupant to the end of the buffer for potential reuse or later truncation.
 */
/** @internal */
export function insertNew(
  state: ReactiveDependencyTracker,
  trackIndex: number,
  link: DependencyLink
): void {
  const occupant = state._depSlots.at(trackIndex);
  depBufferSetAt(state, trackIndex, link);
  if (occupant !== null) depBufferPush(state, occupant);
}

/** @internal */
export function depBufferSetAt(
  state: ReactiveDependencyTracker,
  index: number,
  dependencyLink: DependencyLink | null
): void {
  state._depSlots.setAt(index, dependencyLink);
}

/** @internal */
export function depBufferPush(
  state: ReactiveDependencyTracker,
  dependencyLink: DependencyLink
): number {
  return state._depSlots.push(dependencyLink);
}

/**
 * Checks if any dependency in the buffer has changed.
 * Deep check will force evaluation of computed dependencies.
 *
 * @internal
 */
export function isBufferDirty(state: ReactiveDependencyTracker): boolean {
  return isDirtyInternal(state, true);
}

/**
 * Quick check to see if a dependency is marked dirty without triggering re-evaluation.
 *
 * @internal
 */
export function isBufferShallowDirty(state: ReactiveDependencyTracker): boolean {
  return isDirtyInternal(state, false);
}

function isDirtyInternal(state: ReactiveDependencyTracker, deep: boolean): boolean {
  const slots = state._depSlots;
  const slotsLength = slots.length;
  if (slotsLength === 0) return false;

  const IS_COMPUTED = COMPUTED_STATE_FLAGS.IS_COMPUTED;
  const DIRTY = COMPUTED_STATE_FLAGS.DIRTY;

  for (let i = 0; i < slotsLength; i++) {
    const link = slots.at(i);
    if (!link) continue;

    const dependency = link.node;

    if (deep && (dependency.flags & IS_COMPUTED) !== 0) {
      // Logic: Accessing .value on a computed dependency triggers its internal
      // check/refresh logic. If it throws, we track it for debugging.
      try {
        if (trackingContext.current) {
          untracked(() => dependency.value);
        } else {
          dependency.value;
        }
      } catch (error) {
        trackEvaluationFailure(dependency.id);
        throw error;
      }
    }

    if (dependency.version !== link.version) return true;
    if (!deep && (dependency.flags & DIRTY) !== 0) return true;
  }
  return false;
}

/**
 * Cleans up subscriptions and state for all slots from the given index onwards.
 *
 * Caution: This is usually called after a tracking phase to remove dependencies
 * that are no longer active in the current execution branch.
 *
 * @internal
 */
export function depBufferTruncateFrom(state: ReactiveDependencyTracker, index: number): void {
  const slots = state._depSlots;
  const slotsLength = slots.length;
  if (index < slotsLength) {
    for (let i = index; i < slotsLength; i++) {
      const link = slots.at(i);
      if (link) {
        if (link.unsubscribeCallback) {
          try {
            link.unsubscribeCallback();
          } catch (unsubscribeError) {
            if (IS_DEV) console.error(`${LOG_PREFIX} Unsubscribe failed:`, unsubscribeError);
          }
        }
      }
    }
    slots.truncateFrom(index);
  }

  refreshDepFlags(state);
}

/**
 * Fully disposes of the buffer state, clearing all subscriptions.
 *
 * @internal
 */
export function disposeAll(state: ReactiveDependencyTracker): void {
  depBufferTruncateFrom(state, 0);
  state._depFlags &= ~BUFFER_FLAGS.HAS_COMPUTEDS;
}
