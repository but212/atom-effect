/**
 * @module Atom
 *
 * Responsibility:
 * Defines the primary stateful primitive (`Atom`) for the reactive system.
 * Manages synchronous value updates and coordinates notification scheduling.
 *
 * Design Intent:
 * Atoms serve as source nodes in the reactive graph. They minimize overhead
 * by avoiding dependency tracking of their own, focusing on efficient
 * propagation to downstream subscribers.
 */

import type { SlotBuffer } from '@but212/atom-effect-utils';
import {
  ATOM_STATE_FLAGS,
  BRAND,
  BrandFlags,
  DEFAULT_EQUAL,
  EPOCH_CONSTANTS,
  IS_DEV,
  KIND,
  SMI_MAX,
} from '@/constants';
import {
  nextVersion,
  nodeIsDisposed,
  nodeIsNotifying,
  nodeNotifySubscribers,
  nodeSubscribe,
  nodeSubscriberCount,
  trackingContext,
} from '@/core/base';
import type {
  AtomOptions,
  DepBufferState,
  DependencyId,
  ReactiveNode,
  Subscriber,
  Subscription,
  WritableAtom,
} from '@/types';
import { debug, generateId } from '@/utils';
import { scheduler, schedulerIsBatching, schedulerSchedule } from './scheduler';

/**
 * Role: Internal implementation of a {@link WritableAtom}.
 *
 * Logic: Dependency Graph Integration
 * As a leaf node, an atom does not track upstream dependencies. It persists
 * as a source for `Computed` and `Effect` nodes.
 *
 * @internal
 */
class AtomImpl<T> implements WritableAtom<T>, ReactiveNode<T> {
  flags: number = 0;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  _k: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;
  _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: null,
  };

  private _value: T;

  /** Optimization: Captured during mutation to enable net-zero suppression in batches. */
  private _pendingOldValue: T | undefined;
  private _equal: (a: T, b: T) => boolean;

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Writable;

  constructor(initialValue: T, options: AtomOptions<T>) {
    this._value = initialValue;
    this._equal = options.equal ?? DEFAULT_EQUAL;

    if (options.sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    debug.attachDebugInfo(this, 'atom', this.id, options.name);
  }

  get isDisposed(): boolean {
    return nodeIsDisposed(this);
  }

  get isComputed(): boolean {
    return false;
  }

  get isNotifying(): boolean {
    return nodeIsNotifying(this);
  }

  get hasError(): boolean {
    return false;
  }

  /** @internal */
  get isNotificationScheduled(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) !== 0;
  }

  /** @internal */
  get isSync(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0;
  }

  /**
   * Logic: Reactive Tracking
   * Retrieves the current value and automatically registers the caller
   * as a subscriber if executed within a tracking context.
   */
  get value(): T {
    trackingContext.current?.addDependency(this);
    return this._value;
  }

  set value(newValue: T) {
    if (this._equal(this._value, newValue)) return;

    const oldValue = this._value;
    this._value = newValue;
    this.version = nextVersion(this.version);

    if (IS_DEV) debug.trackUpdate(this.id, debug.getDebugName(this));

    this._scheduleNotification(oldValue);
  }

  /**
   * Attaches a listener to be notified when the atom's value changes.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    return nodeSubscribe(this, listener);
  }

  /**
   * Returns the current number of active subscribers.
   */
  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }

  /**
   * Logic: Notification Orchestration
   * Schedules a notification cycle. If the atom is configured for synchronous
   * delivery and no batch is active, the flush occurs immediately.
   */
  private _scheduleNotification(oldValue: T): void {
    const flags = this.flags;
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    if ((flags & SCHED) !== 0 || !this._storage.slots?.length) return;

    this._pendingOldValue = oldValue;
    this.flags |= SCHED;

    if ((flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler)) {
      if (!this.isNotifying) this._flushNotifications();
    } else {
      schedulerSchedule(scheduler, this);
    }
  }

  /**
   * @internal - Interface for the global scheduler.
   */
  execute(): void {
    this._flushNotifications();
  }

  /**
   * Logic: Notification Batching
   * Synchronizes the internal state with all subscribers.
   *
   * Constraint:
   * Only proceeds if the notification is still scheduled and the atom
   * has not been disposed.
   */
  private _flushNotifications(): void {
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    const MASK = SCHED | ATOM_STATE_FLAGS.DISPOSED;
    const isSyncActive =
      (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler);

    while ((this.flags & MASK) === SCHED) {
      const prev = this._pendingOldValue as T;
      const next = this._value;

      this._pendingOldValue = undefined;
      this.flags &= ~SCHED;

      if (!this._equal(next, prev)) {
        nodeNotifySubscribers(this, next, prev);
      }

      if (!isSyncActive) break;
    }
  }

  /**
   * Accesses the current value without triggering reactive tracking.
   *
   * When to use:
   * - Inside event handlers or callbacks where tracking is undesirable.
   * - During initialization phases where no reactive connection is required.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Logic: Resource Disposal
   * Permanently releases the atom's value and clears all subscriptions.
   *
   * Caution:
   * Subsequent access to a disposed atom may lead to undefined behavior.
   */
  dispose(): void {
    const DISP = ATOM_STATE_FLAGS.DISPOSED;
    if ((this.flags & DISP) !== 0) return;

    this.flags |= DISP;
    this._storage.slots?.clear();

    // Reason: Release references immediately to facilitate GC in large-scale state trees.
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = DEFAULT_EQUAL;
  }
}

/**
 * Creates a reactive atom to manage mutable state.
 *
 * When to use:
 * - As the primary source of truth for local or shared application state.
 * - When data must be manually updated via the `.value` property.
 *
 * @param initialValue - The initial data stored in the atom.
 * @param options - Configuration for custom equality checks or delivery strategies.
 *
 * @example
 * ```typescript
 * import { atom } from '@but212/atom-effect';
 *
 * const count = atom(0);
 * count.value++; // Triggers downstream reactive updates
 *
 * console.log(count.value); // 1
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions<T> = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options);
}
