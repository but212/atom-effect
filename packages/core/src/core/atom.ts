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
import { Result } from '@but212/atom-effect-utils';
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
  nodeNotifySubscribers,
  nodeSubscribe,
  nodeSubscriberCount,
  trackingContext,
} from '@/core/base';
import type {
  AtomOptions,
  DependencyId,
  ReactiveNode,
  Subscriber,
  SubscriberTarget,
  WritableAtom,
} from '@/types';
import { AtomError, debug, generateId } from '@/utils';
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
  flags: number = 0;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  _trackEpoch: number = 0;
  _trackCount: number = 0;
  _error: Error | null = null;
  _k: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;

  _slots: SlotBuffer<SubscriberTarget<T>> | null = null;

  #value: T;
  #pendingOldValue: T | undefined;
  #equal: (a: T, b: T) => boolean;

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Writable;

  constructor(initialValue: T, options?: AtomOptions<T>) {
    this.#value = initialValue;
    this.#equal = options?.equal ?? DEFAULT_EQUAL;

    if (options?.sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    if (IS_DEV) debug.attachDebugInfo(this, 'atom', this.id, options?.name);
  }

  // ReactiveNode Personality Traits (Declarative Data)
  readonly isComputed = false;
  readonly isRejected = false;
  readonly hasError = false;

  get isDisposed(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.DISPOSED) !== 0;
  }
  get isNotifying(): boolean {
    return this._slots?.isLocked ?? false;
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
   * Accessing this property registers the current active effect/computed as
   * a dependent of this atom.
   */
  get value(): T {
    if (this.isDisposed) return undefined as unknown as T;
    const ctx = trackingContext.current;
    if (ctx) ctx.addDependency(this);
    return this.#value;
  }

  /**
   * Logic: State Mutation & Propagation
   * Updates the internal value and increments the version if the new value
   * fails the equality check. Triggers downstream notifications.
   */
  set value(newValue: T) {
    if (this.isDisposed) return;
    if (this.#equal(this.#value, newValue)) return;

    const oldValue = this.#value;
    this.#value = newValue;

    // Logic: Versioning
    // Incremented to signal to dependents that the source has changed.
    this.version = nextVersion(this.version);

    if (IS_DEV) debug.trackUpdate(this.id, debug.getDebugName(this));

    this.#scheduleNotification(oldValue);
  }

  /**
   * Attaches a listener that executes when the atom value changes.
   *
   * @param listener - Callback receiving the new and previous values.
   * @returns A disposal function to unsubscribe the listener.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const unsub = Result.unwrap(nodeSubscribe(this, listener));
    if (this.isDisposed) {
      unsub();
      return () => {};
    }
    return unsub;
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
    const flags = this.flags;
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    const slots = this._slots;

    // Optimization: Avoid redundant scheduling if already queued or no subscribers exist.
    if ((flags & SCHED) !== 0 || !slots || slots.length === 0) return;

    this.#pendingOldValue = oldValue;
    this.flags |= SCHED;

    if ((flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler)) {
      if (!slots.isLocked) this.#flushNotifications();
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
      (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler);

    while ((this.flags & MASK) === SCHED) {
      const prev = this.#pendingOldValue as T;
      const next = this.#value;

      this.#pendingOldValue = undefined;
      this.flags &= ~SCHED;

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
    const flags = this.flags;
    const DISP = ATOM_STATE_FLAGS.DISPOSED;
    if ((flags & DISP) !== 0) return;

    this.flags |= DISP;
    const slots = this._slots;
    if (slots) slots.clear();

    // Reason: Release references immediately to facilitate efficient GC.
    this.#value = undefined as T;
    this.#pendingOldValue = undefined;
    this.#equal = DEFAULT_EQUAL;
  }
}

function validateAtomOptions<T>(options: unknown): Result<void, Error> {
  if (options != null && typeof options === 'object') {
    const opts = options as AtomOptions<T>;
    if (opts.equal !== undefined && typeof opts.equal !== 'function') {
      return Result.err(new AtomError('options.equal must be a function'));
    }
  }
  return Result.ok(undefined);
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
  const validation = validateAtomOptions(options);
  Result.unwrap(validation);
  return new AtomImpl(initialValue, options);
}
