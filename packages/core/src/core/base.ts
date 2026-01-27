import { IS_DEV, NODE_FLAGS, SMI_MAX } from '@/constants';
import { SubscriberLink } from '@/core/dep-tracking';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes (Atoms, Computed, Effects).
 */
export class ReactiveNode {
  /** Bit flags representing the node's state */
  flags: number;
  /** Current version of the node's value */
  version: number;
  /** Last epoch this node was observed by the system */
  _lastSeenEpoch: number;
  /** Epoch when this node was last modified */
  _modifiedAtEpoch: number;
  /** Unique numeric identifier within SMI range */
  readonly id: DependencyId;

  /** @internal Temporary unsubscription function used during sync/propagation */
  _tempUnsub: (() => void) | undefined;

  constructor() {
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = -1;
    this._modifiedAtEpoch = -1;
    this.id = (generateId() & SMI_MAX) as DependencyId;

    this._tempUnsub = undefined;
  }
}

/**
 * Abstract base class for reactive nodes that can be dependencies (Atom, Computed).
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected abstract _subscribers: SubscriberLink<T>[];

  /**
   * Subscribes a listener function or Subscriber object to value changes.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const subs = this._subscribers;
    const isFn = typeof listener === 'function';

    // Guard clause for invalid input
    if (
      !isFn &&
      (listener === null ||
        typeof listener !== 'object' ||
        typeof (listener as Subscriber).execute !== 'function')
    ) {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }

    // Optimization: Loop specialization to avoid branch inside loop
    const len = subs.length;
    if (isFn) {
      for (let i = 0; i < len; i++) {
        if (subs[i]!.fn === listener) {
          if (IS_DEV) {
            console.warn(
              'Attempted to subscribe the same listener twice. Ignoring duplicate subscription.'
            );
          }
          return () => {};
        }
      }
    } else {
      for (let i = 0; i < len; i++) {
        if (subs[i]!.sub === listener) {
          if (IS_DEV) {
            console.warn(
              'Attempted to subscribe the same listener twice. Ignoring duplicate subscription.'
            );
          }
          return () => {};
        }
      }
    }

    const link = isFn
      ? new SubscriberLink<T>(listener as (newValue?: T, oldValue?: T) => void)
      : new SubscriberLink<T>(undefined, listener as Subscriber);

    subs.push(link);
    this.flags |= isFn ? NODE_FLAGS.HAS_FN_SUBS : NODE_FLAGS.HAS_OBJ_SUBS;

    return () => {
      const idx = subs.indexOf(link);
      if (idx === -1) return;

      // Fast removal (swap-pop)
      const last = subs.pop()!;
      if (idx < subs.length) {
        subs[idx] = last;
      }

      const activeLen = subs.length;
      if (activeLen === 0) {
        this.flags &= ~(NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS);
      } else {
        // Optimization: Early exit if we still have both types
        let foundFn = false;
        let foundObj = false;

        for (let i = 0; i < activeLen; i++) {
          const s = subs[i]!;
          if (s.fn) foundFn = true;
          else foundObj = true;

          if (foundFn && foundObj) break;
        }

        let newFlags = this.flags;
        if (!foundFn) newFlags &= ~NODE_FLAGS.HAS_FN_SUBS;
        if (!foundObj) newFlags &= ~NODE_FLAGS.HAS_OBJ_SUBS;
        this.flags = newFlags;
      }
    };
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return this._subscribers.length;
  }

  /**
   * Notifies all subscribers of a change.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const flags = this.flags;
    if (!(flags & (NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS))) return;

    const subs = this._subscribers;
    const len = subs.length;

    for (let i = 0; i < len; i++) {
      const s = subs[i]!;
      try {
        // Optimization: Direct property check prefers function (likely common case)
        if (s.fn) {
          s.fn(newValue, oldValue);
        } else if (s.sub) {
          s.sub.execute();
        }
      } catch (err) {
        this._handleNotifyError(err);
      }
    }
  }

  /**
   * Hoisted error reporter to keep notification loops lean and aid JIT inlining.
   */
  private _handleNotifyError(err: unknown): void {
    console.error(new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error));
  }
}
