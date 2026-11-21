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
import { FLAGS, IS_DEV, LOG_PREFIX } from '@/constants';
import type {
  Dependency,
  DependencyId,
  DependencyLink,
  DependencySubscriber,
  SubscriberTarget,
} from '@/types';
import { generateId, nextSmi } from '@/utils';
import { debug } from '@/utils/debug';
import { trackingContext, untracked } from './base';

let trackingSessionEpoch = 0;

export abstract class ReactiveTracker implements DependencySubscriber {
  flags: number = 0;
  readonly id: DependencyId = generateId();

  _depSlots: SlotBuffer<DependencyLink> = new SlotBuffer<DependencyLink>();
  _hasComputedDeps = false;
  _trackEpoch: number = 0;
  _trackCount: number = 0;
  _nextEpoch: number | undefined = undefined;

  abstract addDependency(dependency: Dependency): void;

  /**
   * Starts a new dependency tracking phase by advancing the tracking epoch
   * and resetting the track counter.
   */
  startTracking(): number {
    trackingSessionEpoch = nextSmi(trackingSessionEpoch);
    const epoch = trackingSessionEpoch;
    this._trackEpoch = epoch;
    this._trackCount = 0;
    return epoch;
  }

  /**
   * Registers a dependency during an active tracking session.
   * Uses session-level versioning via `_lastSeenEpoch` for deduplication.
   */
  trackDependency(dependency: Dependency, notifyCallback: SubscriberTarget<unknown>): void {
    const trackEpoch = this._trackEpoch;
    if (dependency._lastSeenEpoch === trackEpoch) return;

    if (dependency._lastSeenEpoch > trackEpoch) {
      const slots = this._depSlots;
      for (let i = 0; i < this._trackCount; i++) {
        if (slots.at(i)?.node === dependency) {
          dependency._lastSeenEpoch = trackEpoch;
          return;
        }
      }
    }

    dependency._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;

    if (!this.#claimExisting(dependency, trackIndex)) {
      const unsubscribe = dependency.subscribe(notifyCallback);
      const occupant = this._depSlots.at(trackIndex);
      this._depSlots.setAt(trackIndex, {
        node: dependency,
        version: dependency.version,
        unsubscribeCallback: unsubscribe,
      });
      if (occupant !== null) this._depSlots.push(occupant);
    }

    if (!this._hasComputedDeps && dependency.isComputed) {
      this._hasComputedDeps = true;
    }
  }

  /**
   * Attempts to reuse an existing subscription for a dependency during re-evaluation.
   */
  #claimExisting(dependency: Dependency, trackIndex: number): boolean {
    const slots = this._depSlots;
    if (slots.length <= trackIndex) return false;

    const current = slots.at(trackIndex);
    if (current?.node === dependency) {
      current.version = dependency.version;
      return true;
    }

    for (let i = trackIndex + 1, slotsLength = slots.length; i < slotsLength; i++) {
      const link = slots.at(i);
      if (link?.node !== dependency) continue;
      link.version = dependency.version;

      const swappedLink = slots.at(trackIndex);
      slots.setAt(trackIndex, link);
      slots.setAt(i, swappedLink);
      return true;
    }
    return false;
  }

  /**
   * Cleans up subscriptions and state for all slots from the given index onwards.
   */
  truncateDepsFrom(index: number): void {
    const slots = this._depSlots;
    const slotsLength = slots.length;
    if (index < slotsLength) {
      for (let i = index; i < slotsLength; i++) {
        const link = slots.at(i);
        if (link) {
          try {
            link.unsubscribeCallback();
          } catch (unsubscribeError) {
            if (IS_DEV) console.error(`${LOG_PREFIX} Unsubscribe failed:`, unsubscribeError);
          }
        }
      }
      slots.truncateFrom(index);
    }

    if (!this._hasComputedDeps) return;

    let hasComputedDeps = false;
    for (let i = 0, len = slots.length; i < len; i++) {
      const link = slots.at(i);
      if (link?.node.isComputed) {
        hasComputedDeps = true;
        break;
      }
    }
    this._hasComputedDeps = hasComputedDeps;
  }

  /**
   * Checks whether any upstream dependency has changed or is dirty.
   * When `deep` is true, reading computed dependencies forces re-evaluation.
   */
  isDepsDirty(deep = true): boolean {
    const slots = this._depSlots;
    const slotsLength = slots.length;
    if (slotsLength === 0) return false;

    for (let i = 0; i < slotsLength; i++) {
      const link = slots.at(i);
      if (!link) continue;

      const dependency = link.node;

      if (deep && dependency.isComputed) {
        try {
          if (trackingContext.current) {
            untracked(() => dependency.value);
          } else {
            dependency.value;
          }
        } catch (error) {
          debug.trackEvaluationFailure(dependency.id);
          if (
            error instanceof RangeError ||
            error instanceof ReferenceError ||
            error instanceof SyntaxError
          ) {
            throw error;
          }
          return true;
        }
      }

      if (dependency.version !== link.version) return true;
      if (!deep && (dependency.flags & FLAGS.DIRTY) !== 0) return true;
    }
    return false;
  }
}
