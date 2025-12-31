/**
 * @fileoverview atom: Core reactive state primitive
 * @description Reactive state container with automatic dependency tracking and subscriber notification
 */

import { AtomError } from '../errors/errors';
import { ERROR_MESSAGES } from '../errors/messages';
import type { AtomOptions, WritableAtom } from '../types';
import { debug, generateId } from '../utils/debug';
import { scheduler } from '../utils/scheduler';
import { trackingContext } from '../utils/tracking';

/**
 * Reactive atom implementation
 *
 * Atom is the fundamental unit of reactive state. It holds a value and notifies
 * subscribers when the value changes. Atoms support both function-based and
 * object-based subscribers for flexibility in different use cases.
 *
 * Features:
 * - Automatic dependency tracking via trackingContext
 * - Duplicate subscriber prevention
 * - Stale notification prevention via version checking
 * - Batch scheduling support for performance optimization
 */
class AtomImpl<T> implements WritableAtom<T> {
  /** Current stored value */
  private _value: T;
  /** Version counter for stale notification prevention */
  private _version: number;

  /** Function-based subscribers */
  private _fnSubs: Array<(newValue?: T, oldValue?: T) => void>;
  /** Count of active function subscribers */
  private _fnSubCount: number;
  /** Object-based subscribers (e.g., computed, effect) */
  private _objSubs: Array<{ execute: () => void }>;
  /** Count of active object subscribers */
  private _objSubCount: number;

  /** Whether to notify synchronously (bypass scheduler) */
  private readonly _sync: boolean;
  /** Unique identifier for debugging */
  private readonly _id: string;

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
   * Gets the current value and registers the caller as a dependency if tracking is active.
   */
  get value(): T {
    const current = trackingContext.getCurrent();
    if (current !== null && current !== undefined) {
      this._track(current);
    }
    return this._value;
  }

  /**
   * Sets a new value and notifies all subscribers if the value has changed.
   * Uses Object.is for equality comparison to handle edge cases like NaN.
   */
  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    const currentVersion = ++this._version;
    this._value = newValue;

    // Early exit if no subscribers
    if ((this._fnSubCount | this._objSubCount) === 0) return;

    this._notify(newValue, oldValue, currentVersion);
  }

  /**
   * Registers the current tracking context as a subscriber.
   * Handles both function-based and object-based trackers.
   *
   * If addDependency exists, it handles subscription management externally,
   * so we don't add as direct subscriber to avoid double subscription.
   */
  private _track(current: unknown): void {
    if (typeof current === 'function') {
      // Check if this function has addDependency (like effect's execute or computed's tempMarkDirty)
      const fnWithDep = current as { addDependency?: (dep: unknown) => void };
      if (fnWithDep.addDependency !== undefined) {
        // addDependency handles subscription management, don't double-subscribe
        fnWithDep.addDependency(this);
      } else {
        // Simple function subscriber without external management
        this._addFnSub(current as (newValue?: T, oldValue?: T) => void);
      }
    } else {
      const tracker = current as { execute?: () => void; addDependency?: (dep: unknown) => void };
      if (tracker.addDependency !== undefined) {
        // addDependency handles subscription management
        tracker.addDependency(this);
      } else if (tracker.execute !== undefined) {
        // Object subscriber without external management
        this._addObjSub(tracker as { execute: () => void });
      }
    }
  }

  /**
   * Adds a function subscriber with duplicate prevention.
   * Returns an unsubscribe function for cleanup.
   */
  private _addFnSub(sub: (newValue?: T, oldValue?: T) => void): () => void {
    const subs = this._fnSubs;
    const idx = this._fnSubCount;

    // Check for duplicate subscription
    for (let i = 0; i < idx; i++) {
      if (subs[i] === sub) return this._createUnsub(i, true);
    }

    subs[idx] = sub;
    this._fnSubCount = idx + 1;

    return this._createUnsub(idx, true);
  }

  /**
   * Adds an object subscriber with duplicate prevention.
   */
  private _addObjSub(sub: { execute: () => void }): void {
    const subs = this._objSubs;
    const count = this._objSubCount;

    // Check for duplicate subscription
    for (let i = 0; i < count; i++) {
      if (subs[i] === sub) return;
    }

    subs[count] = sub;
    this._objSubCount = count + 1;
  }

  /**
   * Creates an unsubscribe function for the given subscriber index.
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
   * Removes a function subscriber using swap-and-pop for O(1) removal.
   */
  private _removeFnSub(idx: number): void {
    const count = this._fnSubCount;
    if (idx >= count) return;

    const lastIdx = count - 1;
    const subs = this._fnSubs;

    // Swap with last element and pop
    subs[idx] = subs[lastIdx] as (newValue?: T, oldValue?: T) => void;
    subs[lastIdx] = undefined as any;
    this._fnSubCount = lastIdx;
  }

  /**
   * Removes an object subscriber using swap-and-pop for O(1) removal.
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
   * Uses version checking to prevent stale notifications when multiple
   * changes occur before notification executes.
   */
  private _notify(newValue: T, oldValue: T, currentVersion: number): void {
    const doNotify = (): void => {
      // Skip if a newer value has been set
      if (this._version !== currentVersion) return;

      const fnSubs = this._fnSubs;
      const fnCount = this._fnSubCount;
      const objSubs = this._objSubs;
      const objCount = this._objSubCount;
      // ...

      // Notify function subscribers
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

      // Notify object subscribers
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

    // Execute synchronously or schedule based on configuration
    if (this._sync && !scheduler.isBatching) {
      doNotify();
    } else {
      scheduler.schedule(doNotify);
    }
  }

  /**
   * Manually subscribes a listener function to value changes.
   * @param listener - Function to call when value changes
   * @returns Unsubscribe function
   */
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void {
    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._addFnSub(listener);
  }

  /**
   * Gets the current value without registering as a dependency.
   * Useful for reading values in contexts where tracking is undesired.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Cleans up all subscribers and releases resources.
   * The atom should not be used after disposal.
   */
  dispose(): void {
    this._fnSubs.length = 0;
    this._objSubs.length = 0;
    this._fnSubCount = 0;
    this._objSubCount = 0;
    this._value = undefined as T;
  }

  /**
   * Returns the total number of active subscribers (for debugging).
   */
  subscriberCount(): number {
    return this._fnSubCount + this._objSubCount;
  }
}

/**
 * Creates a reactive atom that holds a value and notifies subscribers on changes.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 *
 * // Read value (registers dependency if in tracking context)
 * console.log(count.value); // 0
 *
 * // Write value (notifies subscribers)
 * count.value = 1;
 *
 * // Manual subscription
 * const unsub = count.subscribe((newVal, oldVal) => {
 *   console.log(`Changed from ${oldVal} to ${newVal}`);
 * });
 *
 * // Cleanup
 * unsub();
 * count.dispose();
 * ```
 *
 * @param initialValue - The initial value of the atom
 * @param options - Configuration options
 * @param options.sync - If true, notifications are synchronous (default: false)
 * @returns A writable atom instance
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
