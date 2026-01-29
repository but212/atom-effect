import { IS_DEV, NODE_FLAGS, SMI_MAX } from '@/constants';

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
  /** Modified epoch */
  _modifiedAtEpoch = -1;
  /** Debug ID */
  readonly id: DependencyId = (generateId() & SMI_MAX) as DependencyId;
  /** Temporary unsubscribe slot */
  _tempUnsub: (() => void) | undefined = undefined;
}

/**
 * Reactive dependency base class.
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  public _fnSubs: ((newValue?: T, oldValue?: T) => void)[] = [];
  public _objSubs: Subscriber[] = [];

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

    if (isFn) {
      const fn = listener as (newValue?: T, oldValue?: T) => void;
      if (this._fnSubs.indexOf(fn) !== -1) {
        if (IS_DEV) console.warn('Duplicate subscription ignored.');
        return () => {};
      }
      this._fnSubs.push(fn);
      this.flags |= NODE_FLAGS.HAS_FN_SUBS;
    } else {
      const sub = listener as Subscriber;
      if (this._objSubs.indexOf(sub) !== -1) {
        if (IS_DEV) console.warn('Duplicate subscription ignored.');
        return () => {};
      }
      this._objSubs.push(sub);
      this.flags |= NODE_FLAGS.HAS_OBJ_SUBS;
    }

    return () => this._unsubscribe(listener, isFn);
  }

  private _unsubscribe(
    listener: ((newValue?: T, oldValue?: T) => void) | Subscriber,
    isFn: boolean
  ): void {
    if (isFn) {
      const subs = this._fnSubs;
      const idx = subs.indexOf(listener as (newValue?: T, oldValue?: T) => void);
      if (idx === -1) return;

      const last = subs.pop();
      if (idx < subs.length && last) {
        subs[idx] = last;
      }

      if (subs.length === 0) {
        this.flags &= ~NODE_FLAGS.HAS_FN_SUBS;
      }
    } else {
      const subs = this._objSubs;
      const idx = subs.indexOf(listener as Subscriber);
      if (idx === -1) return;

      const last = subs.pop();
      if (idx < subs.length && last) {
        subs[idx] = last;
      }

      if (subs.length === 0) {
        this.flags &= ~NODE_FLAGS.HAS_OBJ_SUBS;
      }
    }
  }

  subscriberCount(): number {
    return this._fnSubs.length + this._objSubs.length;
  }

  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const flags = this.flags;
    if (!(flags & (NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS))) return;

    if (flags & NODE_FLAGS.HAS_FN_SUBS) {
      const subs = this._fnSubs;
      const len = subs.length;
      for (let i = 0; i < len; i++) {
        const fn = subs[i];
        if (!fn) continue;
        try {
          fn(newValue, oldValue);
        } catch (err) {
          this._handleNotifyError(err);
        }
      }
    }

    if (flags & NODE_FLAGS.HAS_OBJ_SUBS) {
      const subs = this._objSubs;
      const len = subs.length;
      for (let i = 0; i < len; i++) {
        const sub = subs[i];
        if (!sub) continue;
        try {
          sub.execute();
        } catch (err) {
          this._handleNotifyError(err);
        }
      }
    }
  }

  private _handleNotifyError(err: unknown): void {
    console.error(wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
  }
}
