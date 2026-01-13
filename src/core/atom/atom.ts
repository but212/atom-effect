import { SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base/reactive-dependency';
import { scheduler } from '@/internal/scheduler';
import { trackingContext } from '@/tracking';
import { hasDependencyMethod, hasExecuteMethod, isPlainListener } from '@/tracking/tracking.types';
import type { AtomOptions, Subscriber, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { SubscriberManager } from '@/utils/subscriber-manager';

/** Internal WritableAtom implementation with optimized subscriber management */
class AtomImpl<T> extends ReactiveDependency<T> implements WritableAtom<T> {
  private _value: T;
  private readonly _functionSubscribersStore: SubscriberManager<
    (newValue?: T, oldValue?: T) => void
  >;
  private readonly _objectSubscribersStore: SubscriberManager<Subscriber>;
  private readonly _sync: boolean;
  private readonly _notifyTask: () => void;
  private _pendingOldValue: T | undefined;
  private _isNotificationScheduled: boolean = false;

  constructor(initialValue: T, sync: boolean) {
    super();
    this._value = initialValue;
    this._functionSubscribersStore = new SubscriberManager();
    this._objectSubscribersStore = new SubscriberManager();
    this._sync = sync;
    this._notifyTask = this._flushNotifications.bind(this);
    debug.attachDebugInfo(this, 'atom', this.id);
  }

  protected get _functionSubscribers(): SubscriberManager<(newValue?: T, oldValue?: T) => void> {
    return this._functionSubscribersStore;
  }

  protected get _objectSubscribers(): SubscriberManager<Subscriber> {
    return this._objectSubscribersStore;
  }

  /** Gets value and registers as dependency in current tracking context */
  get value(): T {
    const current = trackingContext.getCurrent();
    if (current) this._track(current);
    return this._value;
  }

  /** Sets value and notifies subscribers if changed (uses Object.is) */
  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    this.version = (this.version + 1) & SMI_MAX;
    this._value = newValue;

    // Early exit: no subscribers to notify
    if (
      !this._functionSubscribersStore.hasSubscribers &&
      !this._objectSubscribersStore.hasSubscribers
    )
      return;

    this._scheduleNotification(oldValue);
  }

  private _track(current: unknown): void {
    // Priority 1: TrackableListener pattern (addDependency method)
    if (hasDependencyMethod(current)) {
      current.addDependency(this);
      return;
    }
    // Priority 2: Plain function callback
    if (isPlainListener(current)) {
      this._functionSubscribersStore.add(current as (newValue?: T, oldValue?: T) => void);
      return;
    }
    // Priority 3: Subscriber pattern (execute method)
    if (hasExecuteMethod(current)) {
      this._objectSubscribersStore.add(current);
    }
  }

  private _scheduleNotification(oldValue: T): void {
    if (!this._isNotificationScheduled) {
      this._pendingOldValue = oldValue;
      this._isNotificationScheduled = true;
    }

    // Hot path first: sync mode without batching flushes immediately
    if (this._sync && !scheduler.isBatching) {
      this._flushNotifications();
    } else {
      scheduler.schedule(this._notifyTask);
    }
  }

  private _flushNotifications(): void {
    if (!this._isNotificationScheduled) return;

    const oldValue = this._pendingOldValue as T;
    const newValue = this._value;

    this._pendingOldValue = undefined;
    this._isNotificationScheduled = false;

    this._notifySubscribers(newValue, oldValue);
  }

  /** Gets value without registering as dependency */
  peek(): T {
    return this._value;
  }

  dispose(): void {
    this._functionSubscribersStore.clear();
    this._objectSubscribersStore.clear();
    this._value = undefined as T;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 * @param initialValue - Initial value
 * @param options - { sync?: boolean } for immediate notifications
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
