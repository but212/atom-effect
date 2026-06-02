/**
 * @module DependencyBuffers
 *
 * This module manages the state of dependency tracking during reactive evaluations.
 * It uses a hybrid approach (Array-like slots + Lazy Map) to balance memory
 * overhead for small atoms and lookup performance for complex computations.
 */

import { BUFFER_CONFIG, COMPUTED_STATE_FLAGS, IS_DEV, LOG_PREFIX } from '@/constants';
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
  state._depFlags &= ~BUFFER_FLAGS.HAS_COMPUTEDS;
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
  dep: Dependency,
  trackIndex: number
): boolean {
  const slots = state._depSlots;
  if (slots.length <= trackIndex) return false;

  const current = slots.at(trackIndex);
  if (current?.node === dep && current.unsub) {
    current.version = dep.version;
    return true;
  }

  const existingIndex = findExistingIndex(state, dep, trackIndex);
  if (existingIndex === -1) return false;

  const link = slots.at(existingIndex);
  if (!link) return false;
  link.version = dep.version;

  const temp = slots.at(trackIndex);

  // Reason: Swapping instead of splicing keeps the SlotBuffer size stable
  // and avoids O(n) array shifts during a tracking run.
  slots.setAt(trackIndex, link);
  slots.setAt(existingIndex, temp);

  mapSwap(state, dep, trackIndex, temp, existingIndex);

  return true;
}

/**
 * Searches for a dependency in the buffer, preferring the Map if available.
 */
function findExistingIndex(
  state: ReactiveDependencyTracker,
  dep: Dependency,
  start: number
): number {
  if (state._depMap) {
    const idx = state._depMap.get(dep);
    return idx !== undefined && idx >= start ? idx : -1;
  }

  const slots = state._depSlots;
  for (let i = start + 1, len = slots.length; i < len; i++) {
    const link = slots.at(i);
    if (link?.node === dep && link.unsub) return i;
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
  trackIdx: number,
  link: DependencyLink
): void {
  const occupant = state._depSlots.at(trackIdx);
  depBufferSetAt(state, trackIdx, link);
  if (occupant !== null) depBufferPush(state, occupant);
}

/** @internal */
export function depBufferSetAt(
  state: ReactiveDependencyTracker,
  index: number,
  item: DependencyLink | null
): void {
  const old = state._depSlots.at(index);
  if (old === item) return;
  state._depSlots.setAt(index, item);

  if (old) {
    mapUnregister(state, old.node, index);
  }
  if (item) {
    mapRegister(state, item, index);
  }
}

/** @internal */
export function depBufferPush(state: ReactiveDependencyTracker, item: DependencyLink): number {
  const idx = state._depSlots.push(item);
  mapRegister(state, item, idx);
  return idx;
}

/**
 * Initializes the lookup map only when the dependency count hits MAP_THRESHOLD.
 * This saves memory for the vast majority of small/simple reactive nodes.
 */
function ensureMap(state: ReactiveDependencyTracker): void {
  if (state._depMap || state._depSlots.length <= BUFFER_CONFIG.MAP_THRESHOLD) return;

  const map = new Map<Dependency, number>();
  const slots = state._depSlots;
  for (let i = 0; i < slots.length; i++) {
    const link = slots.at(i);
    if (link?.unsub) map.set(link.node, i);
  }
  state._depMap = map;
}

/**
 * Registers a dependency link in the lookup map.
 */
function mapRegister(state: ReactiveDependencyTracker, link: DependencyLink, index: number): void {
  if (!link.unsub) return;
  ensureMap(state);
  state._depMap?.set(link.node, index);
}

/**
 * Unregisters or updates the map index for a dependency when a slot is overwritten or truncated.
 * Searches backwards from limitIndex - 1 to find another valid slot.
 */
function mapUnregister(
  state: ReactiveDependencyTracker,
  node: Dependency,
  currentIndex: number,
  limitIndex = currentIndex
): void {
  const map = state._depMap;
  if (!map || map.get(node) !== currentIndex) return;

  const slots = state._depSlots;
  for (let i = limitIndex - 1; i >= 0; i--) {
    const link = slots.at(i);
    if (link?.node === node && link.unsub) {
      map.set(node, i);
      return;
    }
  }
  map.delete(node);
}

/**
 * Updates the map indices when two dependency slots are swapped.
 */
function mapSwap(
  state: ReactiveDependencyTracker,
  depA: Dependency,
  idxA: number,
  linkB: DependencyLink | null,
  idxB: number
): void {
  const map = state._depMap;
  if (!map) return;

  map.set(depA, idxA);

  if (linkB?.unsub && (map.get(linkB.node) ?? -1) < idxB) {
    map.set(linkB.node, idxB);
  }
}

/**
 * Checks if any dependency in the buffer has changed.
 * Deep check will force evaluation of computed dependencies.
 *
 * @internal
 */
export function isBufferDirty(state: ReactiveDependencyTracker): boolean {
  return checkDirty(state, true);
}

/**
 * Quick check to see if a dependency is marked dirty without triggering re-evaluation.
 *
 * @internal
 */
export function isBufferShallowDirty(state: ReactiveDependencyTracker): boolean {
  return checkDirty(state, false);
}

function checkDirty(state: ReactiveDependencyTracker, deep: boolean): boolean {
  const slots = state._depSlots;
  const len = slots.length;
  if (len === 0) return false;

  const IS_COMPUTED = COMPUTED_STATE_FLAGS.IS_COMPUTED;
  const DIRTY = COMPUTED_STATE_FLAGS.DIRTY;

  for (let i = 0; i < len; i++) {
    const link = slots.at(i);
    if (!link) continue;

    const dep = link.node;

    if (deep && (dep.flags & IS_COMPUTED) !== 0) {
      // Logic: Accessing .value on a computed dependency triggers its internal
      // check/refresh logic. If it throws, we track it for debugging.
      try {
        if (trackingContext.current) {
          untracked(() => dep.value);
        } else {
          dep.value;
        }
      } catch (e) {
        trackEvaluationFailure(dep.id);
        throw e;
      }
    }

    if (dep.version !== link.version) return true;
    if (!deep && (dep.flags & DIRTY) !== 0) return true;
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
  const len = slots.length;
  if (index >= len) return;

  for (let i = index; i < len; i++) {
    const link = slots.at(i);
    if (link) {
      mapUnregister(state, link.node, i, index);
      if (link.unsub) {
        try {
          link.unsub();
        } catch (e) {
          if (IS_DEV) console.error(`${LOG_PREFIX} Unsubscribe failed:`, e);
        }
      }
    }
  }
  slots.truncateFrom(index);

  // Memory cleanup: If the buffer shrinks below the threshold, discard the map
  // to free up memory on long-lived atoms.
  if (state._depMap && index <= BUFFER_CONFIG.MAP_THRESHOLD) {
    state._depMap = null;
  }
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
