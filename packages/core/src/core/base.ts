import { IS_DEV, SMI_MAX } from '@/constants';
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
  _lastSeenEpoch = -1;
  /** Debug ID */
  readonly id: DependencyId = generateId() & SMI_MAX;
}

/**
 * Reactive dependency base class.
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected abstract _subscribers: Subscription<T>[];

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

    if (
      this._subscribers.some((sub) => {
        if (!sub) return false;
        return isFn ? sub.fn === listener : sub.sub === listener;
      })
    ) {
      if (IS_DEV) console.warn('Duplicate subscription ignored.');
      return () => {};
    }

    const link = new Subscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    const subs = this._subscribers;
    subs.push(link);

    return () => this._unsubscribe(link);
  }

  private _unsubscribe(link: Subscription<T>): void {
    const subs = this._subscribers;
    const idx = subs.indexOf(link);
    if (idx === -1) return;

    // Remove subscriber
    const last = subs.pop();
    if (idx < subs.length && last) {
      subs[idx] = last;
    }
  }

  subscriberCount(): number {
    return this._subscribers.length;
  }

  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    if (this._subscribers.length === 0) return;

    const subs = this._subscribers.slice(0);
    subs.forEach((s) => {
      if (!s) return;
      try {
        if (s.fn) s.fn(newValue, oldValue);
        else if (s.sub) s.sub.execute();
      } catch (err) {
        this._handleNotifyError(err);
      }
    });
  }

  private _handleNotifyError(err: unknown): void {
    console.error(wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
  }
}
