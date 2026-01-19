import { ATOM_STATE_FLAGS, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base/reactive-dependency';
import { scheduler } from '@/internal/scheduler';
import { trackingContext } from '@/tracking';
import type { AtomOptions, Subscriber, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { SubscriberManager } from '@/utils/subscriber-manager';
import { trackDependency } from '../utils/dep-tracking';

/**
 * Internal {@link WritableAtom} implementation.
 * Extends {@link ReactiveDependency} to provide reactive state that can be observed and updated.
 */
class AtomImpl<T> extends ReactiveDependency<T> implements WritableAtom<T> {
  private _value: T;
  private _pendingOldValue: T | undefined;
  private _notifyTask: (() => void) | undefined;
  private _functionSubscribersStore: SubscriberManager<
    (newValue?: T, oldValue?: T) => void
  > | null = null;
  private _objectSubscribersStore: SubscriberManager<Subscriber> | null = null;

  constructor(initialValue: T, sync: boolean) {
    super();
    this._value = initialValue;
    if (sync) this.flags |= ATOM_STATE_FLAGS.SYNC;

    // Attach debug info in dev mode
    debug.attachDebugInfo(this, 'atom', this.id);
  }

  protected get _functionSubscribers(): SubscriberManager<(newValue?: T, oldValue?: T) => void> {
    if (!this._functionSubscribersStore) {
      this._functionSubscribersStore = new SubscriberManager();
    }
    return this._functionSubscribersStore;
  }

  protected get _objectSubscribers(): SubscriberManager<Subscriber> {
    if (!this._objectSubscribersStore) {
      this._objectSubscribersStore = new SubscriberManager();
    }
    return this._objectSubscribersStore;
  }

  /**
   * Returns the current value and registers the atom as a dependency if in a tracking context.
   */
  get value(): T {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._functionSubscribers, this._objectSubscribers);
    return this._value;
  }

  /**
   * Sets a new value and schedules notifications if the value has changed.
   */
  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    this._value = newValue;
    this.version = (this.version + 1) & SMI_MAX;

    // Check for subscribers: O(1) before scheduling
    const hasFuncSubs = this._functionSubscribersStore?.hasSubscribers;
    const hasObjSubs = this._objectSubscribersStore?.hasSubscribers;

    if (hasFuncSubs || hasObjSubs) {
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

  /**
   * Overridden to avoid unnecessary manager creation during notification loop.
   */
  protected override _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    if (this._functionSubscribersStore) {
      this._functionSubscribersStore.forEachSafe((sub) => sub(newValue, oldValue));
    }
    if (this._objectSubscribersStore) {
      this._objectSubscribersStore.forEachSafe((sub) => sub.execute());
    }
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    this._functionSubscribersStore?.clear();
    this._objectSubscribersStore?.clear();
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
