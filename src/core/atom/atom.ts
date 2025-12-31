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
import type { AtomOptions, WritableAtom } from '../../types';
import { debug, generateId } from '../../utils/debug';

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

  /** Array of function-based subscribers */
  private _fnSubs: Array<(newValue?: T, oldValue?: T) => void>;

  /** Count of active function subscribers (may differ from array length due to sparse removal) */
  private _fnSubCount: number;

  /** Array of object-based subscribers with execute method */
  private _objSubs: Array<{ execute: () => void }>;

  /** Count of active object subscribers */
  private _objSubCount: number;

  /** Whether notifications should be synchronous (bypass scheduler batching) */
  private readonly _sync: boolean;

  /** Unique identifier for debugging purposes */
  private readonly _id: string;

  /**
   * Creates a new AtomImpl instance.
   *
   * @param initialValue - The initial value of the atom
   * @param sync - Whether to notify subscribers synchronously
   */
  constructor(initialValue: T, sync: boolean) {
    this._value = initialValue;
    this._version = 0;
    this._fnSubs = [];
    this._fnSubCount = 0;
    this._objSubs = [];
    this._objSubCount = 0;
    this._sync = sync;
    this._id = generateId().toString();

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

    if ((this._fnSubCount | this._objSubCount) === 0) return;

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
        this._addFnSub(current as (newValue?: T, oldValue?: T) => void);
      }
    } else {
      const tracker = current as { execute?: () => void; addDependency?: (dep: unknown) => void };
      if (tracker.addDependency !== undefined) {
        tracker.addDependency(this);
      } else if (tracker.execute !== undefined) {
        this._addObjSub(tracker as { execute: () => void });
      }
    }
  }

  /**
   * Adds a function-based subscriber.
   *
   * @param sub - The subscriber function to add
   * @returns An unsubscribe function
   *
   * @remarks
   * Prevents duplicate subscriptions by checking existing subscribers.
   */
  private _addFnSub(sub: (newValue?: T, oldValue?: T) => void): () => void {
    const subs = this._fnSubs;
    const idx = this._fnSubCount;

    for (let i = 0; i < idx; i++) {
      if (subs[i] === sub) return this._createUnsub(i, true);
    }

    subs[idx] = sub;
    this._fnSubCount = idx + 1;

    return this._createUnsub(idx, true);
  }

  /**
   * Adds an object-based subscriber.
   *
   * @param sub - The subscriber object with an execute method
   *
   * @remarks
   * Prevents duplicate subscriptions by checking existing subscribers.
   */
  private _addObjSub(sub: { execute: () => void }): void {
    const subs = this._objSubs;
    const count = this._objSubCount;

    for (let i = 0; i < count; i++) {
      if (subs[i] === sub) return;
    }

    subs[count] = sub;
    this._objSubCount = count + 1;
  }

  /**
   * Creates an unsubscribe function for a subscriber at the given index.
   *
   * @param idx - The index of the subscriber
   * @param isFn - Whether this is a function subscriber (true) or object subscriber (false)
   * @returns An unsubscribe function
   */
  private _createUnsub(idx: number, isFn: boolean): () => void {
    return () => {
      if (isFn) {
        this._removeFnSub(idx);
      } else {
        this._removeObjSub(idx);
      }
    };
  }

  /**
   * Removes a function subscriber at the given index.
   *
   * @param idx - The index of the subscriber to remove
   *
   * @remarks
   * Uses swap-and-pop removal for O(1) performance.
   */
  private _removeFnSub(idx: number): void {
    const count = this._fnSubCount;
    if (idx >= count) return;

    const lastIdx = count - 1;
    const subs = this._fnSubs;

    subs[idx] = subs[lastIdx] as (newValue?: T, oldValue?: T) => void;
    subs[lastIdx] = undefined as any;
    this._fnSubCount = lastIdx;
  }

  /**
   * Removes an object subscriber at the given index.
   *
   * @param idx - The index of the subscriber to remove
   *
   * @remarks
   * Uses swap-and-pop removal for O(1) performance.
   */
  private _removeObjSub(idx: number): void {
    const count = this._objSubCount;
    if (idx >= count) return;

    const lastIdx = count - 1;
    const subs = this._objSubs;

    subs[idx] = subs[lastIdx] as { execute: () => void };
    subs[lastIdx] = undefined as any;
    this._objSubCount = lastIdx;
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
  private _notify(newValue: T, oldValue: T, currentVersion: number): void {
    const doNotify = (): void => {
      if (this._version !== currentVersion) return;

      const fnSubs = this._fnSubs;
      const fnCount = this._fnSubCount;
      const objSubs = this._objSubs;
      const objCount = this._objSubCount;

      for (let i = 0; i < fnCount; i++) {
        try {
          const fn = fnSubs[i];
          if (fn) {
            fn(newValue, oldValue);
          }
        } catch (e) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, e as Error)
          );
        }
      }

      for (let i = 0; i < objCount; i++) {
        try {
          const sub = objSubs[i];
          if (sub) {
            sub.execute();
          }
        } catch (e) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, e as Error)
          );
        }
      }
    };

    if (this._sync && !scheduler.isBatching) {
      doNotify();
    } else {
      scheduler.schedule(doNotify);
    }
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
    return this._addFnSub(listener);
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
    this._fnSubs.length = 0;
    this._objSubs.length = 0;
    this._fnSubCount = 0;
    this._objSubCount = 0;
    this._value = undefined as T;
  }

  /**
   * Gets the total number of active subscribers.
   *
   * @returns The count of function and object subscribers combined
   */
  subscriberCount(): number {
    return this._fnSubCount + this._objSubCount;
  }
}

/**
 * Creates a new reactive atom with the given initial value.
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
