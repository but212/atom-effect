import { ATOM_STATE_FLAGS, IS_DEV } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { BRAND, BrandFlags } from '@/symbols';
import type { AtomOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { nextVersion, scheduler } from './scheduler';
import { trackingContext } from './tracking';

/**
 * Internal implementation of a {@link WritableAtom}.
 *
 * This class manages a single piece of mutable state and coordinates notification
 * scheduling for its subscribers. Participation in the dependency graph is
 * handled automatically through the `value` getter and setter.
 */
class AtomImpl<T> extends ReactiveNode<T> implements WritableAtom<T> {
  private _value: T;
  /** Old value captured during a mutation, used for subscriber notifications. */
  private _pendingOldValue: T | undefined;
  private _equal: (a: T, b: T) => boolean;

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Writable;

  constructor(initialValue: T, options: AtomOptions<T>) {
    super();
    this._value = initialValue;
    this._equal = options.equal ?? Object.is;

    if (options.sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    debug.attachDebugInfo(this, 'atom', this.id, options.name);
  }

  /**
   * Indicates whether a notification for this atom has been scheduled but not yet flushed.
   * @internal
   */
  get isNotificationScheduled(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) !== 0;
  }

  /**
   * Indicates whether this atom is configured to notify its subscribers synchronously.
   * @internal
   */
  get isSync(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0;
  }

  /**
   * Retrieves the current value and registers a dependency if called in a reactive context.
   */
  get value(): T {
    const ctx = trackingContext.current;
    // Logic: Automatic dependency tracking during execution of Computeds/Effects.
    if (ctx != null) {
      ctx.addDependency(this);
    }
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (this._equal(oldValue, newValue)) return;

    this._value = newValue;
    this.version = nextVersion(this.version);

    if (IS_DEV) {
      debug.trackUpdate(this.id, debug.getDebugName(this));
    }

    this._scheduleNotification(oldValue);
  }

  /**
   * Orchestrates the scheduling of subscriber notifications.
   *
   * Logic: If the atom is in `sync` mode and no batch is currently active, notifications
   * are flushed immediately to ensure predictable synchronous behavior. Otherwise,
   * the notification is delegated to the global scheduler for microtask-based delivery.
   */
  private _scheduleNotification(oldValue: T): void {
    const currentFlags = this.flags;
    const SCHED_BIT = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // Constraint: Prevent redundant scheduling if a flush is already pending.
    if ((currentFlags & SCHED_BIT) !== 0) return;
    const slots = this._slots;
    if (slots === null || slots.length === 0) return;

    this._pendingOldValue = oldValue;
    const nextFlags = currentFlags | SCHED_BIT;
    this.flags = nextFlags;

    const SYNC_BIT = ATOM_STATE_FLAGS.SYNC;
    if ((nextFlags & SYNC_BIT) !== 0 && !scheduler.isBatching) {
      // Logic: Direct flush for sync atoms outside of batch blocks to minimize latency.
      if (this._notifying === 0) {
        this._flushNotifications();
      }
      return;
    }

    scheduler.schedule(this);
  }

  /**
   * Entry point for the scheduler to trigger a notification flush.
   * @internal
   */
  execute(): void {
    this._flushNotifications();
  }

  /**
   * Flushes pending notifications to all active subscribers.
   *
   * Optimization: Implements a net-zero check to suppress notifications if the value
   * returns to its original state during a batch operation.
   */
  private _flushNotifications(): void {
    const SCHED_BIT = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    const DISP_BIT = ATOM_STATE_FLAGS.DISPOSED;
    const SYNC_BIT = ATOM_STATE_FLAGS.SYNC;
    const LOOP_MASK = SCHED_BIT | DISP_BIT;

    let flags = this.flags;
    // Logic: Breadth-first execution loop to handle re-entrant synchronous updates.
    while ((flags & LOOP_MASK) === SCHED_BIT) {
      const oldValue = this._pendingOldValue as T;
      this._pendingOldValue = undefined;

      this.flags = flags &= ~SCHED_BIT;

      const currentVal = this._value;
      if (!this._equal(currentVal, oldValue)) {
        this._notifySubscribers(currentVal, oldValue);
      }

      flags = this.flags;
      // Optimization: Only continue looping if we are in sync mode and not batching.
      if ((flags & SYNC_BIT) === 0 || scheduler.isBatching) {
        break;
      }
    }
  }

  /**
   * Accesses the current value without triggering dependency tracking.
   *
   * When to use:
   * - In event handlers or logic where observation of the state is not required.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Disposes of the atom and releases all internal references.
   *
   * Caution: Disposed atoms will throw an error if accessed or modified.
   */
  dispose(): void {
    const flags = this.flags;
    const DISP_BIT = ATOM_STATE_FLAGS.DISPOSED;
    if ((flags & DISP_BIT) !== 0) return;

    this.flags = flags | DISP_BIT;
    this._slots?.clear();

    // Reason: Explicitly clearing references to prevent memory leaks in long-lived applications.
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = Object.is;
  }

  /**
   * Atoms are always considered leaf nodes and do not require deep dirty checking.
   */
  protected override _deepDirtyCheck(): boolean {
    return false;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * When to use:
 * - When defining a primary source of truth for a specific piece of state.
 * - When the state needs to be updated manually (unlike derived computed values).
 *
 * @param initialValue - The initial value stored in the atom.
 * @param options - Configuration for naming, custom equality, or synchronous notification mode.
 * @returns A writable reactive atom instance.
 *
 * @example
 * ```typescript
 * import { atom } from '@but212/atom-effect';
 *
 * const count = atom(0);
 * console.log(count.value); // 0
 *
 * count.value++;
 * // Re-evaluates any dependent effects or computeds asynchronously.
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions<T> = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options);
}
