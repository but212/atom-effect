import { NODE_FLAGS, SMI_MAX } from '@/constants';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes (Atoms, Computed, Effects).
 */
export class ReactiveNode {
  flags: number;
  version: number;
  _lastSeenEpoch: number;
  readonly id: DependencyId;

  constructor() {
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = -1;
    this.id = (generateId() & SMI_MAX) as DependencyId;
  }

  /**
   * Rotates the phase by 1, automatically incrementing cycle on overflow.
   */
  protected rotatePhase(): number {
    this.version = (this.version + 1) & SMI_MAX;
    return this.version;
  }

  /**
   * Calculates the logical distance (shift) between current and cached version.
   */
  getShift(cachedVersion: number): number {
    return (this.version - cachedVersion) & SMI_MAX;
  }
}

/**
 * Abstract base class for reactive nodes that can be dependencies (Atom, Computed).
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected abstract _fnSubs: ((newValue?: T, oldValue?: T) => void)[];
  protected abstract _objSubs: Subscriber[];

  /**
   * Subscribes a listener function or Subscriber object to value changes.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isObject = typeof listener === 'object' && listener !== null && 'execute' in listener;

    if (isObject) {
      return this._addSubscriber(this._objSubs, listener as Subscriber, NODE_FLAGS.HAS_OBJ_SUBS);
    }

    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._addSubscriber(
      this._fnSubs,
      listener as (newValue?: T, oldValue?: T) => void,
      NODE_FLAGS.HAS_FN_SUBS
    );
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return this._fnSubs.length + this._objSubs.length;
  }

  private _addSubscriber<S>(subs: S[], subscriber: S, flag: number): () => void {
    const idx = subs.indexOf(subscriber);
    if (~idx) return () => {};

    subs.push(subscriber);
    this.flags |= flag;

    let unsubscribedMask = 0;
    return () => {
      if (unsubscribedMask) return;
      unsubscribedMask = 1;

      const currentIdx = subs.indexOf(subscriber);
      if (~currentIdx) {
        subs[currentIdx] = subs[subs.length - 1]!;
        subs.pop();
        this.flags &= ~(subs.length === 0 ? flag : 0);
      }
    };
  }

  /**
   * Notifies all subscribers of a change.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    if (this.flags & (NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS)) {
      const fnSubs = this._fnSubs;
      for (let i = 0; i < fnSubs.length; i++) {
        try {
          fnSubs[i]!(newValue, oldValue);
        } catch (err) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
          );
        }
      }

      const objSubs = this._objSubs;
      for (let i = 0; i < objSubs.length; i++) {
        try {
          objSubs[i]!.execute();
        } catch (err) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
          );
        }
      }
    }
  }
}
