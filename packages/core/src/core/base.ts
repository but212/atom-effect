import { IS_DEV, NODE_FLAGS, SMI_MAX } from '@/constants';
import { SubscriberLink } from '@/core/dep-tracking';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';

export class ReactiveNode {
  flags = 0;
  version = 0;
  _lastSeenEpoch = -1;
  _modifiedAtEpoch = -1;
  readonly id: DependencyId = (generateId() & SMI_MAX) as DependencyId;
  _tempUnsub: (() => void) | undefined = undefined;
}

export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected abstract _subscribers: SubscriberLink<T>[];

  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    if (!isFn && (!listener || typeof (listener as Subscriber).execute !== 'function')) {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }

    const subs = this._subscribers;
    for (let i = 0, len = subs.length; i < len; i++) {
      const sub = subs[i]!;
      if (isFn ? sub.fn === listener : sub.sub === listener) {
        if (IS_DEV)
          console.warn(
            'Attempted to subscribe the same listener twice. Ignoring duplicate subscription.'
          );
        return () => {};
      }
    }

    const link = new SubscriberLink<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    subs.push(link);
    this.flags |= isFn ? NODE_FLAGS.HAS_FN_SUBS : NODE_FLAGS.HAS_OBJ_SUBS;

    return () => {
      const idx = subs.indexOf(link);
      if (idx === -1) return;

      const last = subs.pop()!;
      if (idx < subs.length) subs[idx] = last;

      if (subs.length === 0) {
        this.flags &= ~(NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS);
      } else if (isFn) {
        let has = false;
        for (let i = 0; i < subs.length; i++) {
          if (subs[i]!.fn) {
            has = true;
            break;
          }
        }
        if (!has) this.flags &= ~NODE_FLAGS.HAS_FN_SUBS;
      } else {
        let has = false;
        for (let i = 0; i < subs.length; i++) {
          if (subs[i]!.sub) {
            has = true;
            break;
          }
        }
        if (!has) this.flags &= ~NODE_FLAGS.HAS_OBJ_SUBS;
      }
    };
  }

  subscriberCount(): number {
    return this._subscribers.length;
  }

  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    if (!(this.flags & (NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS))) return;

    const subs = this._subscribers;
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i]!;
      try {
        if (s.fn) s.fn(newValue, oldValue);
        else if (s.sub) s.sub.execute();
      } catch (err) {
        this._handleNotifyError(err);
      }
    }
  }

  private _handleNotifyError(err: unknown): void {
    console.error(new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error));
  }
}
