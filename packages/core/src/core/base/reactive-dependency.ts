import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { Subscriber } from '@/types';
import { ReactiveNode } from './reactive-node';

/**
 * Abstract base class for reactive nodes that can be dependencies (Atom, Computed).
 *
 * Extends ReactiveNode with subscriber management capabilities.
 * Inherits phase-shift versioning from ReactiveNode.
 *
 * Performance Note:
 * Storage fields for subscribers are defined in subclasses but managed here
 * to ensure optimal object shape. Subclasses should initialize _fnSubs and _objSubs.
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  /** Array of function-based subscribers */
  protected abstract _fnSubs: ((newValue?: T, oldValue?: T) => void)[] | null;
  /** Array of object-based subscribers */
  protected abstract _objSubs: Subscriber[] | null;

  /**
   * Subscribes a listener function or Subscriber object to value changes.
   *
   * @param listener - Function or Subscriber object to call when the value changes
   * @returns An unsubscribe function
   * @throws {AtomError} If listener is not a function or Subscriber
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    if (typeof listener === 'object' && listener !== null && 'execute' in listener) {
      return this._addSubscriber(this._getObjSubs(), listener);
    }

    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._addSubscriber(this._getFnSubs(), listener);
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return (this._fnSubs?.length ?? 0) + (this._objSubs?.length ?? 0);
  }

  protected abstract _getFnSubs(): ((newValue?: T, oldValue?: T) => void)[];
  protected abstract _getObjSubs(): Subscriber[];

  private _addSubscriber<S>(subs: S[], subscriber: S): () => void {
    if (subs.indexOf(subscriber) !== -1) return () => {};

    subs.push(subscriber);

    let isUnsubscribed = false;
    return () => {
      if (isUnsubscribed) return;
      isUnsubscribed = true;

      const idx = subs.indexOf(subscriber);
      if (idx !== -1) {
        const lastIndex = subs.length - 1;
        if (idx !== lastIndex) {
          subs[idx] = subs[lastIndex]!;
        }
        subs.pop();
      }
    };
  }

  /**
   * Notifies all subscribers of a change.
   *
   * @param newValue - The new value
   * @param oldValue - The old value
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const fnSubs = this._fnSubs;
    if (fnSubs) {
      for (let i = fnSubs.length - 1; i >= 0; i--) {
        try {
          const sub = fnSubs[i];
          if (sub) sub(newValue, oldValue);
        } catch (err) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
          );
        }
      }
    }

    const objSubs = this._objSubs;
    if (objSubs) {
      for (let i = objSubs.length - 1; i >= 0; i--) {
        try {
          const sub = objSubs[i];
          if (sub) sub.execute();
        } catch (err) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
          );
        }
      }
    }
  }
}
