import { SlotBuffer } from '@but212/atom-effect-utils';
import { IS_DEV } from '@/constants';
import type { Dependency } from '@/types';
import type { DependencyLink } from './tracking';

/**
 * Logic: Subscription Reconciliation State
 * Orchestrates the transition of dependencies between execution cycles.
 * @internal
 */
export interface DepBufferState {
  /**
   * Ordered sequence of active subscriptions.
   * Optimization: Uses SlotBuffer for contiguous memory and fast iteration.
   */
  slots: SlotBuffer<DependencyLink>;
  /**
   * Optimization: O(1) Lookup
   * Only populated during active tracking to avoid O(N^2) complexity when
   * reconciling large dependency sets.
   */
  map: Map<Dependency, number> | null;
  /**
   * Optimization: Skip Check
   * When false, indicates no computed nodes are present, allowing the engine
   * to skip recursive dirty validation.
   */
  hasComputeds: boolean;
}

/**
 * Factory for dependency buffers.
 * @internal
 */
export function createDepBuffer(): DepBufferState {
  return {
    slots: new SlotBuffer<DependencyLink>(),
    map: null,
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
 * tracking index.
 *
 * Why:
 * Re-attaching listeners is expensive. Reusing the `unsub` handle from a
 * previous run maintains the reactive connection without triggering
 * subscriber count changes.
 *
 * Strategy:
 * 1. Check if the current slot already holds the dependency (Fast Path).
 * 2. Look ahead using the lookup map or linear search.
 * 3. If found, swap the link to the front to preserve order for the next run.
 *
 * @internal
 */
export function claimExisting(state: DepBufferState, dep: Dependency, trackIndex: number): boolean {
  const { slots } = state;
  if (slots.length <= trackIndex) return false;

  const current = slots.at(trackIndex);
  // Optimization: Direct hit. Just synchronize the version to mark it as "checked".
  if (current?.node === dep && current.unsub) {
    current.version = dep.version;
    return true;
  }

  const existingIndex = _findExistingIndex(state, dep, trackIndex);
  if (existingIndex === -1) return false;

  const link = slots.at(existingIndex)!;
  link.version = dep.version;

  // Logic: Order Preservation
  // Swap the discovered link with whatever occupies the current track index.
  // This ensures "live" dependencies stay at the head of the buffer.
  const temp = slots.at(trackIndex);
  depBufferSetAt(state, trackIndex, link);
  depBufferSetAt(state, existingIndex, temp);
  return true;
}

/**
 * Logic: Heuristic Search
 * Switches between linear search and Map-based O(1) lookup based on buffer state.
 */
function _findExistingIndex(state: DepBufferState, dep: Dependency, start: number): number {
  if (state.map) {
    const idx = state.map.get(dep);
    return idx !== undefined && idx >= start ? idx : -1;
  }

  const slots = state.slots;
  for (let i = start + 1, len = slots.length; i < len; i++) {
    const link = slots.at(i);
    if (link?.node === dep && link.unsub) return i;
  }
  return -1;
}

/**
 * Logic: Displaced Occupant Preservation
 * Inserts a new link at the current index. If an existing link is displaced,
 * it is pushed to the tail so it can be reclaimed later in the same cycle.
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
 * Atomic mutation that synchronizes the O(1) lookup map with the slot buffer.
 * @internal
 */
export function depBufferSetAt(
  state: DepBufferState,
  index: number,
  item: DependencyLink | null
): void {
  const old = state.slots.at(index);
  state.slots.setAt(index, item);

  if (old) state.map?.delete(old.node);
  if (item?.unsub) {
    if (!state.map) state.map = new Map();
    state.map.set(item.node, index);
  }
}

/**
 * Atomic append operation that maintains the lookup map.
 * @internal
 */
export function depBufferPush(state: DepBufferState, item: DependencyLink): number {
  const idx = state.slots.push(item);
  if (item.unsub) {
    if (!state.map) state.map = new Map();
    state.map.set(item.node, idx);
  }
  return idx;
}

/**
 * Logic: Dirty Propagation Check
 * Determines if any dependency has transitioned to a new version.
 *
 * Caution:
 * Accessing `dep.value` on computed nodes may trigger synchronous re-execution
 * of the dependency sub-graph.
 *
 * @internal
 */
export function isBufferDirty(state: DepBufferState): boolean {
  for (let i = 0, len = state.slots.length; i < len; i++) {
    const link = state.slots.at(i);
    if (link && _checkLinkDirty(link)) return true;
  }
  return false;
}

/**
 * Logic: Lazy Refresh
 * Computed nodes only update their version when their value is accessed.
 * We must force a read to ensure the version we compare against is current.
 */
function _checkLinkDirty(link: DependencyLink): boolean {
  const dep = link.node;
  if (dep.isComputed) {
    try {
      // Logic: Pull-based Refresh
      dep.value;
    } catch {
      if (IS_DEV) console.warn(`[atom-effect] Dependency #${dep.id} error in check`);
    }
  }
  return dep.version !== link.version;
}

/**
 * Logic: Post-Tracking Cleanup
 * Removes and unsubscribes from all dependencies that were not reclaimed
 * during the last tracking cycle.
 *
 * Constraint: Memory Integrity
 * Failure to invoke `link.unsub()` results in "Ghost Executions" where
 * disposed or inactive nodes continue to react to state changes.
 *
 * @internal
 */
export function depBufferTruncateFrom(state: DepBufferState, index: number): void {
  const slots = state.slots;
  for (let i = index; i < slots.length; i++) {
    const link = slots.at(i);
    if (link) link.unsub?.();
  }
  slots.truncateFrom(index);

  // Constraint: Phase Locality
  // The lookup map is only valid during the reconciliation phase.
  state.map = null;
}

/**
 * Releases all subscriptions and resets the buffer to an empty state.
 * @internal
 */
export function disposeAll(state: DepBufferState): void {
  depBufferTruncateFrom(state, 0);
  state.hasComputeds = false;
}
