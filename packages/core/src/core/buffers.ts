/**
 * @module DependencyBuffers
 *
 * Responsibility:
 * Orchestrates the lifecycle of reactive connections between nodes. Manages
 * memory-efficient tracking, reconciliation, and dirty propagation checks.
 *
 * Design Intent:
 * Uses a hybrid storage strategy (SlotBuffer + O(1) Lookup Map) to minimize
 * allocation overhead during hot-path execution while maintaining fast
 * dependency resolution for large graphs.
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { BUFFER_CONFIG, COMPUTED_STATE_FLAGS, IS_DEV, LOG_PREFIX } from '@/constants';
import type { DepBufferState, Dependency, DependencyLink, Indexer } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Role: No-op implementation of the Indexer interface for empty buffers.
 * Optimization: Prevents Map allocation for small or empty dependency sets.
 */
const NullIndexer: Indexer = {
  get: () => undefined,
  set: () => {},
  delete: () => {},
};

/** @internal */
class MapIndexer extends Map<Dependency, number> implements Indexer {}

/**
 * Role: Internal factory for dependency buffer states.
 * @internal
 */
export function createDepBuffer(): DepBufferState {
  return {
    slots: new SlotBuffer<DependencyLink>(),
    map: NullIndexer,
    hasComputeds: false,
  };
}

/**
 * Resets diagnostic flags before a new tracking phase.
 * @internal
 */
export function prepareTracking(state: DepBufferState): void {
  state.hasComputeds = false;
}

/**
 * Logic: Subscription Reuse (Claiming)
 * Attempts to locate and move an existing subscription to the current
 * tracking index to avoid redundant listener attachments.
 *
 * Reason:
 * Re-attaching listeners triggers expensive internal state transitions and
 * subscriber count changes. Reusing handles maintains the reactive connection.
 *
 * Strategy:
 * 1. Validates current slot for a direct match (Optimized Fast Path).
 * 2. Performs a heuristic look-ahead search using the lookup map or linear scan.
 * 3. Synchronizes the version and swaps the link to the front to preserve order.
 *
 * @internal
 */
export function claimExisting(state: DepBufferState, dep: Dependency, trackIndex: number): boolean {
  const { slots } = state;
  if (slots.length <= trackIndex) return false;

  const current = slots.at(trackIndex);
  // Optimization: Direct hit synchronization.
  if (current?.node === dep && current.unsub) {
    current.version = dep.version;
    return true;
  }

  const existingIndex = _findExistingIndex(state, dep, trackIndex);
  if (existingIndex === -1) return false;

  const link = slots.at(existingIndex)!;
  link.version = dep.version;

  // Logic: Order Preservation
  // Swaps the discovered link with the occupant at the current track index.
  // This ensures active dependencies occupy the head of the buffer.
  const temp = slots.at(trackIndex);
  depBufferSetAt(state, trackIndex, link);
  depBufferSetAt(state, existingIndex, temp);
  return true;
}

/**
 * Logic: Heuristic Search
 * Dynamically switches between linear search and Map-based O(1) lookup based on
 * buffer size and the MAP_THRESHOLD configuration.
 */
function _findExistingIndex(state: DepBufferState, dep: Dependency, start: number): number {
  const idx = state.map.get(dep);
  if (idx !== undefined) return idx >= start ? idx : -1;

  const slots = state.slots;
  for (let i = start + 1, len = slots.length; i < len; i++) {
    const link = slots.at(i);
    if (link?.node === dep && link.unsub) return i;
  }
  return -1;
}

/**
 * Logic: Displaced Occupant Preservation
 * Inserts a new dependency link. If the current index is occupied, the
 * previous occupant is moved to the tail for potential reclamation.
 * @internal
 */
export function insertNew(state: DepBufferState, trackIdx: number, link: DependencyLink): void {
  const occupant = state.slots.at(trackIdx);
  depBufferSetAt(state, trackIdx, link);

  if (occupant !== null) {
    depBufferPush(state, occupant);
  }
}

/**
 * Logic: Atomic Mutation & Index Synchronization
 * Updates a specific slot and synchronizes the O(1) lookup map.
 * Handles automatic escalation from NullIndexer to MapIndexer.
 * @internal
 */
export function depBufferSetAt(
  state: DepBufferState,
  index: number,
  item: DependencyLink | null
): void {
  const old = state.slots.at(index);
  state.slots.setAt(index, item);

  if (old) state.map.delete(old.node);
  if (item?.unsub) {
    if (state.map === NullIndexer && state.slots.length > BUFFER_CONFIG.MAP_THRESHOLD) {
      state.map = new MapIndexer();
      for (let i = 0; i < state.slots.length; i++) {
        const link = state.slots.at(i);
        if (link?.unsub) state.map.set(link.node, i);
      }
    }
    if (state.map !== NullIndexer) state.map.set(item.node, index);
  }
}

/**
 * Logic: Atomic Append
 * Appends a link to the buffer tail and maintains lookup map integrity.
 * @internal
 */
export function depBufferPush(state: DepBufferState, item: DependencyLink): number {
  const idx = state.slots.push(item);
  if (item.unsub) {
    if (state.map === NullIndexer && state.slots.length > BUFFER_CONFIG.MAP_THRESHOLD) {
      state.map = new MapIndexer();
      for (let i = 0; i < state.slots.length; i++) {
        const link = state.slots.at(i);
        if (link?.unsub) state.map.set(link.node, i);
      }
    }
    if (state.map !== NullIndexer) state.map.set(item.node, idx);
  }
  return idx;
}

/**
 * Logic: Table-based Dirty Validation
 * Dispatches validation logic based on the IS_COMPUTED bitmask.
 */
const DIRTY_CHECKERS = {
  // Logic: Direct Version Check for Atoms
  0: (link) => link.node.version !== link.version,
  // Logic: Recursive "Pull" for Computed Nodes
  [COMPUTED_STATE_FLAGS.IS_COMPUTED]: (link) => {
    const dep = link.node;
    try {
      // Impact: Triggering the getter enforces evaluation of upstream dependencies.
      dep.value;
    } catch {
      // Caution: Transient failures during dirty checks are suppressed to
      // avoid halting the propagation cycle. Failures are logged to the debugger.
      if (IS_DEV) {
        debug.trackEvaluationFailure(dep.id);
      }
    }
    return dep.version !== link.version;
  },
} satisfies Record<number, (link: DependencyLink) => boolean>;

/**
 * Logic: Dirty Propagation Check (Recursive)
 * Evaluates the buffer to determine if any dependency has transitioned.
 * Uses bitmask dispatch to optimize checker selection.
 * @internal
 */
export function isBufferDirty(state: DepBufferState): boolean {
  const slots = state.slots;
  const len = slots.length;
  if (slots.size === 0) return false;

  const checkers = DIRTY_CHECKERS;
  for (let i = 0; i < len; i++) {
    const link = slots.at(i);
    if (!link) continue;
    // Optimized bitwise dispatch
    if (checkers[link.node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED]!(link)) return true;
  }
  return false;
}

/**
 * Logic: Shallow Propagation Check (Push-Path)
 * Validates dependency versions without triggering re-evaluation.
 * Used during the notification phase to detect pending changes.
 * @internal
 */
export function isBufferShallowDirty(state: DepBufferState): boolean {
  const slots = state.slots;
  const len = slots.length;
  for (let i = 0; i < len; i++) {
    const link = slots.at(i);
    if (!link) continue;

    const dep = link.node;
    const version = dep.version;
    // Detects both pulled changes (version drift) and pending signals (DIRTY flag).
    if (version !== link.version || (dep.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0) return true;
  }
  return false;
}

/**
 * Logic: Post-Tracking Cleanup
 * Disposes of and unsubscribes from all dependencies that were not reclaimed.
 *
 * Constraint: Memory Integrity
 * Mandatory teardown of inactive subscriptions prevents "Ghost Executions"
 * and memory leaks in the reactive graph.
 *
 * @internal
 */
export function depBufferTruncateFrom(state: DepBufferState, index: number): void {
  const slots = state.slots;
  const len = slots.length;
  for (let i = index; i < len; i++) {
    const link = slots.at(i);
    if (link) {
      const unsub = link.unsub;
      if (unsub) {
        try {
          unsub();
        } catch (e) {
          if (IS_DEV) {
            console.error(`${LOG_PREFIX} Unsubscribe failed:`, e);
          }
        }
      }
    }
  }
  slots.truncateFrom(index);

  // Phase Locality: The lookup map is invalidated outside reconciliation.
  state.map = NullIndexer;
}

/**
 * Releases all subscriptions and clears the buffer.
 * @internal
 */
export function disposeAll(state: DepBufferState): void {
  depBufferTruncateFrom(state, 0);
  state.hasComputeds = false;
}
