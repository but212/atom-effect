/**
 * @fileoverview atom: Core reactive state primitive
 *
 * Atoms are the fundamental building blocks of the reactive system.
 * They hold mutable state and automatically notify subscribers when their value changes.
 *
 * @example
 * ```ts
 * const count = atom(0);
 * count.value = 1; // Triggers subscribers
 * console.log(count.peek()); // 1 (without tracking)
 * ```
 */

import { AtomError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { scheduler } from '../../scheduler';
import { trackingContext } from '../../tracking';
import type { AtomOptions, Subscriber, WritableAtom } from '../../types';
import { debug, generateId } from '../../utils/debug';
import { SubscriberManager } from '../../utils/subscriber-manager';

/**
 * Internal implementation of the WritableAtom interface.
 *
 * @template T - The type of value stored in the atom
 *
 * @remarks
 * This class manages reactive state with optimized subscriber management.
 * It supports both function-based and object-based subscribers, and handles
 * synchronous or batched notifications based on configuration.
 */
class AtomImpl<T> implements WritableAtom<T> {
  /** Current value stored in the atom */
  private _value: T;

  /** Version counter for change detection and stale notification prevention */
  private _version: number;

  /** Manager for function-based subscribers */
  private readonly _functionSubscribers: SubscriberManager<(newValue?: T, oldValue?: T) => void>;

  /** Manager for object-based subscribers with execute method */
  private readonly _objectSubscribers: SubscriberManager<Subscriber>;

  /** Whether notifications should be synchronous (bypass scheduler batching) */
  private readonly _sync: boolean;

  /** Unique identifier for debugging purposes */
  private readonly _id: string;

  /** Bound notification method to avoid closure allocation */
  private readonly _notifyTask: () => void;

  /** Pending old value for coalesced notifications */
  private _pendingOldValue: T | undefined;

  /** Whether a notification task is currently scheduled */
  private _isNotificationScheduled: boolean = false;

  /**
   * Creates a new AtomImpl instance.
   *
   * @param initialValue - The initial value of the atom
   * @param sync - Whether to notify subscribers synchronously
   */
  constructor(initialValue: T, sync: boolean) {
    this._value = initialValue;
    this._version = 0;
    this._value = initialValue;
    this._version = 0;
    this._functionSubscribers = new SubscriberManager();
    this._objectSubscribers = new SubscriberManager();
    this._sync = sync;
    this._id = generateId().toString();
    this._notifyTask = this._flushNotifications.bind(this);

    debug.attachDebugInfo(this, 'atom', generateId());
  }

  /**
   * Gets the current value and registers the atom as a dependency
   * in the current tracking context.
   *
   * @returns The current value
   *
   * @remarks
   * This getter automatically tracks dependencies when accessed within
   * a computed or effect context.
   */
  get value(): T {
    const current = trackingContext.getCurrent();
    if (current !== null && current !== undefined) {
      this._track(current);
    }
    return this._value;
  }

  /**
   * Sets a new value and notifies all subscribers if the value changed.
   *
   * @param newValue - The new value to set
   *
   * @remarks
   * Uses Object.is for equality comparison. If the value is unchanged,
   * no notifications are sent. Notifications may be batched unless
   * sync mode is enabled.
   */
  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    const currentVersion = ++this._version;
    this._value = newValue;

    if (!this._functionSubscribers.hasSubscribers && !this._objectSubscribers.hasSubscribers)
      return;

    this._notify(newValue, oldValue, currentVersion);
  }

  /**
   * Tracks the current context as a dependency of this atom.
   *
   * @param current - The current tracking context (function or object)
   *
   * @remarks
   * Handles both function-based trackers (with optional addDependency method)
   * and object-based trackers (with execute or addDependency methods).
   */
  private _track(current: unknown): void {
    if (typeof current === 'function') {
      const fnWithDep = current as { addDependency?: (dep: unknown) => void };
      if (fnWithDep.addDependency !== undefined) {
        fnWithDep.addDependency(this);
      } else {
        this._functionSubscribers.add(current as (newValue?: T, oldValue?: T) => void);
      }
    } else {
      const tracker = current as { execute?: () => void; addDependency?: (dep: unknown) => void };
      if (tracker.addDependency !== undefined) {
        tracker.addDependency(this);
      } else if (tracker.execute !== undefined) {
        this._objectSubscribers.add(tracker as Subscriber);
      }
    }
  }

  /**
   * Notifies all subscribers of a value change.
   *
   * @param newValue - The new value
   * @param oldValue - The previous value
   * @param currentVersion - The version at the time of change
   *
   * @remarks
   * Notifications are skipped if the version has changed (stale update).
   * Errors from individual subscribers are caught and logged without
   * interrupting other subscribers.
   */
  /**
   * Schedules a notification.
   * Uses coalescing: if a notification is already scheduled, we update the state
   * but don't schedule a new task. The pending task will see the latest value.
   */
  private _notify(_newValue: T, oldValue: T, _currentVersion: number): void {
    if (!this._isNotificationScheduled) {
      this._pendingOldValue = oldValue;
      this._isNotificationScheduled = true;
      // We don't need to store currentVersion because the flush task
      // will always read the latest version and value.
    }

    if (this._sync && !scheduler.isBatching) {
      this._flushNotifications();
    } else {
      scheduler.schedule(this._notifyTask);
    }
  }

  /**
   * Executes the pending notifications.
   * Bound to 'this' in constructor to avoid closure allocation.
   */
  private _flushNotifications(): void {
    if (!this._isNotificationScheduled) return;

    // Capture state and reset flags BEFORE notifying to handle re-entrancy
    const oldValue = this._pendingOldValue as T;
    const newValue = this._value;

    this._pendingOldValue = undefined;
    this._isNotificationScheduled = false;

    this._functionSubscribers.forEachSafe(
      (sub) => sub(newValue, oldValue),
      (err) =>
        console.error(new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error))
    );

    this._objectSubscribers.forEachSafe(
      (sub) => sub.execute(),
      (err) =>
        console.error(new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error))
    );
  }

  /**
   * Subscribes a listener function to value changes.
   *
   * @param listener - Function to call when the value changes
   * @returns An unsubscribe function
   * @throws {AtomError} If listener is not a function
   *
   * @example
   * ```ts
   * const unsub = myAtom.subscribe((newVal, oldVal) => {
   *   console.log(`Changed from ${oldVal} to ${newVal}`);
   * });
   * // Later: unsub();
   * ```
   */
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void {
    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._functionSubscribers.add(listener);
  }

  /**
   * Gets the current value without registering as a dependency.
   *
   * @returns The current value
   *
   * @remarks
   * Use this method when you need to read the value without
   * creating a reactive dependency (e.g., in event handlers).
   */
  peek(): T {
    return this._value;
  }

  /**
   * Disposes the atom, clearing all subscribers and releasing resources.
   *
   * @remarks
   * After disposal, the atom should not be used. The value is set to
   * undefined to help with garbage collection.
   */
  dispose(): void {
    this._functionSubscribers.clear();
    this._objectSubscribers.clear();
    this._value = undefined as T;
  }

  /**
   * Gets the total number of active subscribers.
   *
   * @returns The count of function and object subscribers combined
   */
  subscriberCount(): number {
    return this._functionSubscribers.size + this._objectSubscribers.size;
  }
}

/**
 * Creates a new atom with the given initial value.
 *
 * @template T - The type of value stored in the atom
 * @param initialValue - The initial value of the atom
 * @param options - Optional configuration options
 * @returns A writable atom instance
 *
 * @example
 * ```ts
 * // Basic usage
 * const count = atom(0);
 *
 * // With sync option for immediate notifications
 * const syncCount = atom(0, { sync: true });
 *
 * // Reading and writing
 * console.log(count.value); // 0
 * count.value = 5;
 * console.log(count.peek()); // 5 (non-tracking read)
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
