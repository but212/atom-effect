import { ATOM_STATE_FLAGS, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base';
import { trackDependency } from '@/core/dep-tracking';
import { scheduler } from '@/internal/scheduler';
import { trackingContext } from '@/tracking';
import type { AtomOptions, Subscriber, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Internal {@link WritableAtom} implementation.
 * Extends {@link ReactiveDependency} to provide reactive state that can be observed and updated.
 */
class AtomImpl<T> extends ReactiveDependency<T> implements WritableAtom<T> {
  private _value: T;
  private _pendingOldValue: T | undefined;
  private _notifyTask: (() => void) | undefined;

  protected _fnSubs: ((newValue?: T, oldValue?: T) => void)[];
  protected _objSubs: Subscriber[];

  constructor(initialValue: T, sync: boolean) {
    super();

    this._value = initialValue;
    this._pendingOldValue = undefined;
    this._notifyTask = undefined;
    this._fnSubs = [];
    this._objSubs = [];

    if (sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    // Attach debug info in dev mode
    debug.attachDebugInfo(this, 'atom', this.id);
  }

  /**
   * Returns the current value and registers the atom as a dependency if in a tracking context.
   */
  get value(): T {
    const current = trackingContext.current;
    if (current) {
      trackDependency(this, current, this._fnSubs, this._objSubs);
    }
    return this._value;
  }

  /**
   * Sets a new value and schedules notifications if the value has changed.
   */
  set value(newValue: T) {
    const oldValue = this._value;
    // Optimization: Identity check is significantly faster than Object.is for common cases.
    if (oldValue === newValue || Object.is(oldValue, newValue)) return;

    this._value = newValue;
    this.version = (this.version + 1) & SMI_MAX;

    const flags = this.flags;
    // Combined bitwise check to reduce property access overhead
    if (flags & (ATOM_STATE_FLAGS.HAS_FN_SUBS | ATOM_STATE_FLAGS.HAS_OBJ_SUBS)) {
      this._scheduleNotification(oldValue);
    }
  }

  /**
   * Schedules or flushes notifications based on sync mode and batching state.
   */
  private _scheduleNotification(oldValue: T): void {
    let flags = this.flags;
    if (!(flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED)) {
      this._pendingOldValue = oldValue;
      flags |= ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
      this.flags = flags;
    }

    // Bypass scheduler if in SYNC mode and not currently batching
    if (flags & ATOM_STATE_FLAGS.SYNC && !scheduler.isBatching) {
      this._flushNotifications();
      return;
    }

    if (!this._notifyTask) {
      this._notifyTask = () => this._flushNotifications();
    }
    const task = this._notifyTask;
    scheduler.schedule(task);
  }

  /**
   * Flushes scheduled notifications and resets state for the next cycle.
   */
  private _flushNotifications(): void {
    const flags = this.flags;
    // Combined guard clause for disposal and redundant flush cycles
    if (!(flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) || flags & ATOM_STATE_FLAGS.DISPOSED) {
      return;
    }

    const oldValue = this._pendingOldValue as T;
    this._pendingOldValue = undefined;
    this.flags = flags & ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    this._notifySubscribers(this._value, oldValue);
  }

  /**
   * Returns the current value without registering it as a dependency.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Disposes of the atom and releases all subscribers and tasks.
   */
  dispose(): void {
    const flags = this.flags;
    if (flags & ATOM_STATE_FLAGS.DISPOSED) {
      return;
    }

    // Reuse arrays by clearing length to avoid new allocations if resubscribed/later pooled
    this._fnSubs.length = 0;
    this._objSubs.length = 0;

    this.flags = flags | ATOM_STATE_FLAGS.DISPOSED;
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._notifyTask = undefined;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * @param initialValue - The initial value of the atom.
 * @param options - Configuration options (sync: boolean).
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
