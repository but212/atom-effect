import { ATOM_STATE_FLAGS } from '@/constants';
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

  protected _fnSubs: ((newValue?: T, oldValue?: T) => void)[] | null = null;
  protected _objSubs: Subscriber[] | null = null;

  constructor(initialValue: T, sync: boolean) {
    super();
    this._value = initialValue;
    if (sync) this.flags |= ATOM_STATE_FLAGS.SYNC;

    // Attach debug info in dev mode
    debug.attachDebugInfo(this, 'atom', this.id);
  }

  protected _getFnSubs(): ((newValue?: T, oldValue?: T) => void)[] {
    this._fnSubs ??= [];
    return this._fnSubs;
  }

  protected _getObjSubs(): Subscriber[] {
    this._objSubs ??= [];
    return this._objSubs;
  }

  /**
   * Returns the current value and registers the atom as a dependency if in a tracking context.
   */
  get value(): T {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._getFnSubs(), this._getObjSubs());
    return this._value;
  }

  /**
   * Sets a new value and schedules notifications if the value has changed.
   */
  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    this._value = newValue;

    // Branchless phase rotation: automatically handles cycle overflow
    this.rotatePhase();

    // Check for subscribers: O(1) before scheduling
    if ((this._fnSubs?.length ?? 0) > 0 || (this._objSubs?.length ?? 0) > 0) {
      this._scheduleNotification(oldValue);
    }
  }

  /**
   * Schedules or flushes notifications based on sync mode and batching state.
   */
  private _scheduleNotification(oldValue: T): void {
    if (!(this.flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED)) {
      this._pendingOldValue = oldValue;
      this.flags |= ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    }

    // Flush immediately if sync and not batching
    if (this.flags & ATOM_STATE_FLAGS.SYNC && !scheduler.isBatching) {
      this._flushNotifications();
      return;
    }

    if (!this._notifyTask) {
      this._notifyTask = () => this._flushNotifications();
    }
    scheduler.schedule(this._notifyTask);
  }

  private _flushNotifications(): void {
    if (!(this.flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED)) return;

    const oldValue = this._pendingOldValue as T;
    const newValue = this._value;

    this._pendingOldValue = undefined;
    this.flags &= ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    this._notifySubscribers(newValue, oldValue);
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    this._fnSubs = null;
    this._objSubs = null;
    this._value = undefined as T;
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
