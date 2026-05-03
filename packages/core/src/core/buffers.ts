import { Result, SlotBuffer } from '@but212/atom-effect-utils';
import type { Dependency } from '@/types';
import type { DependencyLink } from './tracking';

/** @internal */
export interface Indexer {
  get(dep: Dependency): number | undefined;
  set(dep: Dependency, index: number): void;
  delete(dep: Dependency): void;
}

const NullIndexer: Indexer = {
  get: () => undefined,
  set: () => {},
  delete: () => {},
};

class MapIndexer extends Map<Dependency, number> implements Indexer {}

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
   * Always present via Indexer interface to avoid branching.
   * Switched to NullIndexer when inactive.
   */
  map: Indexer;
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

  if (old) state.map.delete(old.node);
  if (item?.unsub) {
    if (state.map === NullIndexer) state.map = new MapIndexer();
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
    if (state.map === NullIndexer) state.map = new MapIndexer();
    state.map.set(item.node, idx);
  }
  return idx;
}

/**
 * Logic: Dirty Propagation Check
 * Determines if any dependency has transitioned to a new version.
 *
 * Strategy: Table-based Validation
 * Dispatches to the appropriate checker using a bitmask index.
 */
const DIRTY_CHECKERS: Record<number, (link: DependencyLink) => boolean> = {
  // Atom path (IS_COMPUTED bit 1 is 0)
  0: (link) => link.node.version !== link.version,
  // Computed path (IS_COMPUTED bit 1 is 2)
  2: (link) => {
    const dep = link.node;
    let res: Result<unknown, Error>;
    try {
      res = Result.ok(dep.value);
    } catch (e) {
      res = Result.err(e as Error);
    }

    Result.match(res, {
      ok: () => {},
      err: () => {
        console.warn(`[atom-effect] Dependency #${dep.id} error in check`);
      },
    });
    return dep.version !== link.version;
  },
};

/**
 * Logic: Dirty Propagation Check
 * @internal
 */
export function isBufferDirty(state: DepBufferState): boolean {
  const slots = state.slots;
  const len = slots.length;
  if (len === 0) return false;

  const checkers = DIRTY_CHECKERS;
  for (let i = 0; i < len; i++) {
    const link = slots.at(i);
    // Guard clause to reduce nesting and improve branch prediction
    if (!link) continue;
    // IS_COMPUTED = 2 (bit 1)
    if (checkers[link.node.flags & 2]!(link)) return true;
  }
  return false;
}

/**
 * Logic: Push-Path Validation
 * A non-recursive check used during the notification phase to avoid
 * re-entrant computation cascades.
 *
 * It returns true if:
 * 1. Any dependency version has already changed.
 * 2. Any dependency is already marked as DIRTY.
 *
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
    // Check for explicit version drift (already pulled changes)
    // or pending changes (push-based dirty signals, 0x0100 is COMPUTED.DIRTY)
    if (version !== link.version || (dep.flags & 0x0100) !== 0) return true;
  }
  return false;
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
  const len = slots.length;
  for (let i = index; i < len; i++) {
    const link = slots.at(i);
    if (link) {
      const unsub = link.unsub;
      if (unsub) {
        let unsubResult: Result<void, Error>;
        try {
          unsub();
          unsubResult = Result.ok(undefined);
        } catch (e) {
          unsubResult = Result.err(e as Error);
        }

        Result.match(unsubResult, {
          ok: () => {},
          err: (e) => {
            if (process.env.NODE_ENV !== 'production') {
              console.error('[atom-effect] Unsubscribe failed:', e);
            }
          },
        });
      }
    }
  }
  slots.truncateFrom(index);

  // Constraint: Phase Locality
  // The lookup map is only valid during the reconciliation phase.
  state.map = NullIndexer;
}

/**
 * Releases all subscriptions and resets the buffer to an empty state.
 * @internal
 */
export function disposeAll(state: DepBufferState): void {
  depBufferTruncateFrom(state, 0);
  state.hasComputeds = false;
}
