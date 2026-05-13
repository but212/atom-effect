/**
 * @module Atom
 *
 * Responsibility:
 * Orchestrates the primary stateful primitive (`Atom`) for the reactive system.
 * Manages synchronous state updates and coordinates notification scheduling.
 *
 * Design Intent:
 * Atoms act as leaf source nodes in the reactive graph. They are optimized for
 * low-overhead propagation, avoiding self-tracking to maximize performance
 * as data sources for Computeds and Effects.
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
 * Logic: Dependency Graph Source
 * As a source node, atoms do not track upstream dependencies. They persist
 * state and notify downstream subscribers (Computeds/Effects) upon mutation.
 *
 * @internal
 */
class AtomImpl<T> implements WritableAtom<T>, ReactiveNode<T> {
  #flags: number = 0;
  #version: number = 0;
  #lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  #nextEpoch: number | undefined = undefined;
  #trackEpoch: number = 0;
  #trackCount: number = 0;
  #error: Error | null = null;
  #k: typeof KIND.Obj = KIND.Obj;

  // Why: Uses bitwise AND with SMI_MAX to ensure the ID remains within V8's
  // Small Integer (Smi) range for optimized property access.
  #id: DependencyId = generateId() & SMI_MAX;

  #storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: null,
  };

  #value: T;

  // Why: Stores the value prior to update to provide it to subscribers
  // during the notification phase, ensuring accurate 'oldValue' reporting.
  #pendingOldValue: T | undefined;
  #equal: (a: T, b: T) => boolean;

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Writable;

  constructor(initialValue: T, options: AtomOptions<T>) {
    this.#value = initialValue;
    this.#equal = options.equal ?? DEFAULT_EQUAL;

    if (options.sync) {
      this.#flags |= ATOM_STATE_FLAGS.SYNC;
    }

    debug.attachDebugInfo(this, 'atom', this.id, options.name);
  }

  // ReactiveNode Interface Implementation
  // These getters/setters integrate the Atom into the core reactive engine.
  get flags() {
    return this.#flags;
  }
  set flags(v) {
    this.#flags = v;
  }
  get version() {
    return this.#version;
  }
  set version(v) {
    this.#version = v;
  }
  get _lastSeenEpoch() {
    return this.#lastSeenEpoch;
  }
  set _lastSeenEpoch(v) {
    this.#lastSeenEpoch = v;
  }
  get _nextEpoch() {
    return this.#nextEpoch;
  }
  set _nextEpoch(v) {
    this.#nextEpoch = v;
  }
  get _trackEpoch() {
    return this.#trackEpoch;
  }
  set _trackEpoch(v) {
    this.#trackEpoch = v;
  }
  get _trackCount() {
    return this.#trackCount;
  }
  set _trackCount(v) {
    this.#trackCount = v;
  }
  get _error() {
    return this.#error;
  }
  set _error(v) {
    this.#error = v;
  }
  get id() {
    return this.#id;
  }
  get _storage() {
    return this.#storage;
  }

  get isDisposed(): boolean {
    return nodeIsDisposed(this);
  }
  get isComputed(): boolean {
    return false;
  }
  get isRejected(): boolean {
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
    return (this.#flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) !== 0;
  }

  /** @internal */
  get isSync(): boolean {
    return (this.#flags & ATOM_STATE_FLAGS.SYNC) !== 0;
  }

  /**
   * Logic: Reactive Tracking
   * Accessing this property registers the current active effect/computed as
   * a dependent of this atom.
   */
  get value(): T {
    trackingContext.current?.addDependency(this);
    return this.#value;
  }

  /**
   * Logic: State Mutation & Propagation
   * Updates the internal value and increments the version if the new value
   * fails the equality check. Triggers downstream notifications.
   */
  set value(newValue: T) {
    if (this.#equal(this.#value, newValue)) return;

    const oldValue = this.#value;
    this.#value = newValue;

    // Logic: Versioning
    // Incremented to signal to dependents that the source has changed.
    this.#version = nextVersion(this.#version);

    if (IS_DEV) debug.trackUpdate(this.#id, debug.getDebugName(this));

    this.#scheduleNotification(oldValue);
  }

  /**
   * Attaches a listener that executes when the atom value changes.
   *
   * @param listener - Callback receiving the new and previous values.
   * @returns A disposal function to unsubscribe the listener.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    return nodeSubscribe(this, listener);
  }

  /**
   * @returns The number of active subscribers currently tracking this atom.
   */
  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }

  /**
   * Logic: Notification Scheduling
   * Determines whether to flush notifications immediately (synchronous mode)
   * or defer to the global scheduler (batched mode).
   */
  #scheduleNotification(oldValue: T): void {
    const flags = this.#flags;
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // Optimization: Avoid redundant scheduling if already queued or no subscribers exist.
    if ((flags & SCHED) !== 0 || !this.#storage.slots?.length) return;

    this.#pendingOldValue = oldValue;
    this.#flags |= SCHED;

    if ((flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler)) {
      if (!this.isNotifying) this.#flushNotifications();
    } else {
      schedulerSchedule(scheduler, this);
    }
  }

  /** @internal - Entry point for the global scheduler. */
  execute(): void {
    this.#flushNotifications();
  }

  /**
   * Logic: Notification Batching
   * Synchronizes state with all subscribers. Ensures that 'oldValue' is
   * cleared after the cycle to prevent memory leaks.
   *
   * Constraint:
   * Must not proceed if the atom has been disposed between scheduling and flushing.
   */
  #flushNotifications(): void {
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    const MASK = SCHED | ATOM_STATE_FLAGS.DISPOSED;
    const isSyncActive =
      (this.#flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler);

    while ((this.#flags & MASK) === SCHED) {
      const prev = this.#pendingOldValue as T;
      const next = this.#value;

      this.#pendingOldValue = undefined;
      this.#flags &= ~SCHED;

      if (!this.#equal(next, prev)) {
        nodeNotifySubscribers(this, next, prev);
      }

      // Logic: Batching Control
      // In batched mode, we only process one notification cycle per flush.
      if (!isSyncActive) break;
    }
  }

  /**
   * Retrieves the current value without registering a reactive dependency.
   *
   * When to use:
   * - Inside logic that needs the current state but should not trigger re-runs
   *   (e.g., event handlers, one-time checks).
   * - During initialization to avoid premature tracking.
   */
  peek(): T {
    return this.#value;
  }

  /**
   * Logic: Resource Disposal
   * Permanently disables the atom, clearing all subscribers and releasing
   * the stored value for garbage collection.
   *
   * Caution:
   * Accessing or updating a disposed atom is an invalid operation and
   * will not trigger further notifications.
   */
  dispose(): void {
    const DISP = ATOM_STATE_FLAGS.DISPOSED;
    if ((this.#flags & DISP) !== 0) return;

    this.#flags |= DISP;
    this.#storage.slots?.clear();

    // Reason: Release references immediately to facilitate efficient GC.
    this.#value = undefined as T;
    this.#pendingOldValue = undefined;
    this.#equal = DEFAULT_EQUAL;
  }
}

/**
 * Creates a reactive atom to manage mutable state.
 *
 * When to use:
 * - As the primary source of truth for local or shared application state.
 * - When data needs to be manually updated via the `.value` property.
 *
 * @param initialValue - The starting value of the atom.
 * @param options - Configuration for custom equality logic or delivery strategy.
 *
 * @example
 * ```typescript
 * import { atom } from '@but212/atom-effect';
 *
 * const count = atom(0);
 *
 * // Subscribing to changes
 * count.subscribe((next, prev) => console.log(`${prev} -> ${next}`));
 *
 * // Updating value
 * count.value += 1; // Logs: "0 -> 1"
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions<T> = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options);
}
