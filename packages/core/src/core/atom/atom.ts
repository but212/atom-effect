import { SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base/reactive-dependency';
import { scheduler } from '@/internal/scheduler';
import { trackingContext } from '@/tracking';
import type { AtomOptions, Subscriber, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { SubscriberManager } from '@/utils/subscriber-manager';
import { DependencyTracker } from '../utils/dep-tracking';

/**
 * Internal {@link WritableAtom} implementation.
 * Extends {@link ReactiveDependency} to provide reactive state that can be observed and updated.
 * Optimized for fast subscriber notification and tracking.
 */
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

  /** Gets the manager for function-based subscribers. */
  protected get _functionSubscribers(): SubscriberManager<(newValue?: T, oldValue?: T) => void> {
    return this._functionSubscribersStore;
  }

  /** Gets the manager for object-based subscribers. */
  protected get _objectSubscribers(): SubscriberManager<Subscriber> {
    return this._objectSubscribersStore;
  }

  /**
   * Returns the current value and registers the atom as a dependency in the current tracking context.
   */
  get value(): T {
    const current = trackingContext.getCurrent();
    if (current) this._track(current);
    return this._value;
  }

  /**
   * Sets a new value and schedules notifications if the value has changed.
   * Uses `Object.is` for comparison.
   */
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
    DependencyTracker.track(
      this,
      current,
      this._functionSubscribersStore,
      this._objectSubscribersStore
    );
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

  /**
   * Returns the current value without registering as a dependency in the tracking context.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Disposes of the atom, clearing all subscribers and resetting the value.
   */
  dispose(): void {
    this._functionSubscribersStore.clear();
    this._objectSubscribersStore.clear();
    this._value = undefined as T;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * Atoms are the building blocks of reactive state. When an atom's value changes,
 * any effects or computed atoms that depend on it will be automatically re-executed.
 *
 * @param initialValue - The initial value of the atom.
 * @param options - Configuration options.
 * @param options.sync - If true, notifications are delivered synchronously when the value changes.
 * @returns A writable atom object.
 *
 * @example
 * ```ts
 * const count = atom(0);
 * count.value = 1; // Notifies subscribers
 * console.log(count.value); // 1
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
