/**
 * @module ReactiveTracker
 *
 * Responsibility:
 * Base abstraction managing upstream dependency subscriptions, SlotBuffer allocation,
 * and version-aware dirty tracking for reactive consumers (Computed and Effect).
 *
 * Design Intent:
 * Eliminates duplicate dependency buffer lifecycle management across intermediate
 * and terminal nodes in the reactive graph.
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { IS_DEV, KIND, LOG_PREFIX, SMI_MAX } from '@/constants';
import type {
  Dependency,
  DependencyId,
  DependencyLink,
  DependencySubscriber,
  ReactiveDependencyTracker,
  SubscriberTarget,
} from '@/types';
import { generateId } from '@/utils';
import {
  BUFFER_FLAGS,
  claimExisting,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
  isBufferDirty,
  refreshDepFlags,
} from './buffers';
import { scheduler } from './scheduler';

export abstract class ReactiveTracker implements ReactiveDependencyTracker, DependencySubscriber {
  flags: number = 0;
  readonly id: DependencyId = (generateId() & SMI_MAX) as DependencyId;
  readonly _kind: typeof KIND.Obj = KIND.Obj;

  _depSlots: SlotBuffer<DependencyLink> = new SlotBuffer<DependencyLink>();
  _depFlags: number = BUFFER_FLAGS.NONE;
  _trackEpoch: number = 0;
  _trackCount: number = 0;
  _nextEpoch: number | undefined = undefined;

  abstract addDependency(dependency: Dependency): void;

  /**
   * Starts a new dependency tracking phase by advancing the tracking epoch
   * and resetting the track counter.
   */
  startTracking(): number {
    const epoch = scheduler.nextEpoch();
    this._trackEpoch = epoch;
    this._trackCount = 0;
    refreshDepFlags(this);
    return epoch;
  }

  /**
   * Finalizes tracking by pruning inactive dependencies from the SlotBuffer
   * and refreshing buffer flags.
   */
  commitDeps(): void {
    try {
      depBufferTruncateFrom(this, this._trackCount);
    } catch (error) {
      if (IS_DEV) {
        console.warn(`${LOG_PREFIX} commitDeps failed for node ${this.id}:`, error);
      }
    }
  }

  /**
   * Registers a dependency during an active tracking session.
   * Uses session-level versioning via `_lastSeenEpoch` for deduplication.
   */
  trackDependency(dependency: Dependency, notifyCallback: SubscriberTarget<unknown>): void {
    if (!this._depSlots) return;

    const trackEpoch = this._trackEpoch;
    if (dependency._lastSeenEpoch === trackEpoch) return;
    dependency._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;

    if (!claimExisting(this, dependency, trackIndex)) {
      const unsubscribe = dependency.subscribe(notifyCallback);
      insertNew(this, trackIndex, {
        node: dependency,
        version: dependency.version,
        unsubscribeCallback: unsubscribe,
      });
    }

    if (!(this._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) && dependency.isComputed) {
      this._depFlags |= BUFFER_FLAGS.HAS_COMPUTEDS;
    }
  }

  /**
   * Disposes of all dependency links and resets dependency flags.
   */
  disposeDeps(): void {
    disposeAll(this);
  }

  /**
   * Checks whether any upstream dependency has changed or is dirty.
   */
  hasDirtyDeps(): boolean {
    return isBufferDirty(this);
  }
}
