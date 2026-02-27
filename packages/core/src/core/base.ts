import { EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { Subscription } from '@/core/dep-tracking';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { wrapError } from '@/utils/error';

/**
 * Base class for all reactive nodes.
 */
export class ReactiveNode {
  /** State flags */
  flags = 0;
  /** Version counter */
  version = 0;
  /** Last access epoch */
  _lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
  /** Scheduler epoch tag */
  _nextEpoch?: number;
  /** Debug ID */
  readonly id: DependencyId = generateId() & SMI_MAX;
}

/**
 * Reactive dependency base class.
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected abstract _subscribers: (Subscription<T> | null)[];
  private _notifying = 0;

  /**
   * Adds subscriber.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    // Validate subscriber
    if (!isFn && (!listener || typeof (listener as Subscriber).execute !== 'function')) {
      throw wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      );
    }

    const subs = this._subscribers;
    const len = subs.length;
    let duplicate = false;

    for (let i = 0; i < len; i++) {
      const sub = subs[i];
      if (sub != null) {
        if (isFn ? sub.fn === listener : sub.sub === listener) {
          duplicate = true;
          break;
        }
      }
    }

    if (duplicate) {
      if (IS_DEV) console.warn('Duplicate subscription ignored.');
      return () => {};
    }

    const link = new Subscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    subs.push(link);

    return () => this._unsubscribe(link);
  }

  private _unsubscribe(link: Subscription<T>): void {
    const subs = this._subscribers;
    let idx = -1;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i] === link) {
        idx = i;
        break;
      }
    }

    if (idx === -1) return;

    if (this._notifying > 0) {
      // Tombstone
      subs[idx] = null;
      return;
    }

    // Remove subscriber (pop-and-swap)
    const last = subs.pop();
    if (idx < subs.length && last !== undefined) {
      subs[idx] = last;
    }
  }

  subscriberCount(): number {
    let count = 0;
    const subs = this._subscribers;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i] != null) count++;
    }
    return count;
  }

  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const subs = this._subscribers;
    const len = subs.length;
    if (len === 0) return;

    this._notifying++;
    try {
      for (let i = 0; i < len; i++) {
        const s = subs[i];
        if (s != null) {
          try {
            s.notify(newValue, oldValue);
          } catch (err) {
            this._handleNotifyError(err);
          }
        }
      }
    } finally {
      this._notifying--;
      if (this._notifying === 0) {
        this._cleanupTombstones();
      }
    }
  }

  private _cleanupTombstones(): void {
    const subs = this._subscribers;
    let i = 0;
    while (i < subs.length) {
      if (subs[i] === null) {
        const last = subs.pop();
        if (i < subs.length && last !== undefined) {
          subs[i] = last;
        }
      } else {
        i++;
      }
    }
  }

  private _handleNotifyError(err: unknown): void {
    console.error(wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
  }
}
