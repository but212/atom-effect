import { IS_DEV, NODE_FLAGS, SMI_MAX } from '@/constants';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, HasFlags, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes (Atoms, Computed, Effects).
 */
export class ReactiveNode implements HasFlags {
  /** Bit flags representing the node's state */
  flags: number;
  /** Current version of the node's value */
  version: number;
  /** Last epoch this node was observed by the system */
  _lastSeenEpoch: number;
  /** Epoch when this node was last modified */
  _modifiedAtEpoch: number;
  /** Epoch used for circular dependency detection and graph traversal */
  _visitedEpoch: number;
  /** Unique numeric identifier within SMI range */
  readonly id: DependencyId;

  /** @internal Temporary unsubscription function used during sync/propagation */
  _tempUnsub: (() => void) | undefined;

  constructor() {
    // Group numeric field initializations to establish a stable Hidden Class (Shape) for V8.
    // Consistent initialization order prevents shape transitions, optimizing property access.
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = -1;
    this._modifiedAtEpoch = -1;
    this._visitedEpoch = -1;
    this.id = (generateId() & SMI_MAX) as DependencyId;
    this._tempUnsub = undefined;
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
    if (typeof listener === 'function') {
      return this._addSubscriber(
        this._fnSubs,
        listener as (newValue?: T, oldValue?: T) => void,
        NODE_FLAGS.HAS_FN_SUBS
      );
    }

    if (listener && typeof (listener as Subscriber).execute === 'function') {
      return this._addSubscriber(this._objSubs, listener as Subscriber, NODE_FLAGS.HAS_OBJ_SUBS);
    }

    throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return this._fnSubs.length + this._objSubs.length;
  }

  /**
   * Adds a subscriber to the specified subscription list and returns an unsubscribe function.
   * Uses swap-and-pop for efficient removals.
   */
  private _addSubscriber<S>(subs: S[], subscriber: S, flag: number): () => void {
    if (subs.indexOf(subscriber) !== -1) {
      if (IS_DEV) {
        console.warn(
          'Attempted to subscribe the same listener twice. Ignoring duplicate subscription.'
        );
      }
      return () => {};
    }

    subs.push(subscriber);
    this.flags |= flag;

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;

      const currentIdx = subs.indexOf(subscriber);
      if (currentIdx === -1) return;

      const last = subs.pop()!;
      if (currentIdx < subs.length) {
        subs[currentIdx] = last;
      }
      if (subs.length === 0) {
        this.flags &= ~flag;
      }
    };
  }

  /**
   * Notifies all subscribers of a change.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const { flags } = this;
    const subMask = NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS;

    if (!(flags & subMask)) return;

    if (flags & NODE_FLAGS.HAS_FN_SUBS) {
      const subs = this._fnSubs;
      for (let i = 0, len = subs.length; i < len; i++) {
        const sub = subs[i];
        if (sub) {
          try {
            sub(newValue, oldValue);
          } catch (err) {
            console.error(
              new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
            );
          }
        }
      }
    }

    if (flags & NODE_FLAGS.HAS_OBJ_SUBS) {
      const subs = this._objSubs;
      for (let i = 0, len = subs.length; i < len; i++) {
        const sub = subs[i];
        if (sub) {
          try {
            sub.execute();
          } catch (err) {
            console.error(
              new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
            );
          }
        }
      }
    }
  }
}
