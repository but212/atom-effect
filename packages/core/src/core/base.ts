import { IS_DEV, NODE_FLAGS, SMI_MAX } from '@/constants';
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
  protected abstract _fnSubs: ((newValue?: T, oldValue?: T) => void)[];
  protected abstract _objSubs: Subscriber[];

  /**
   * Subscribes a listener function or Subscriber object to value changes.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    // 1. Function listener
    if (typeof listener === 'function') {
      return this._addSubscriber(this._fnSubs, listener, NODE_FLAGS.HAS_FN_SUBS);
    }

    // 2. Object listener (Subscriber)
    if (
      listener !== null &&
      typeof listener === 'object' &&
      'execute' in (listener as Subscriber)
    ) {
      return this._addSubscriber(this._objSubs, listener as Subscriber, NODE_FLAGS.HAS_OBJ_SUBS);
    }

    throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
  }

  /**
   * Internal helper for subscription logic to reduce code duplication and branching.
   */
  private _addSubscriber<S>(subs: S[], listener: S, flag: number): () => void {
    // Optimization: Skip duplicates (O(N) search is cache-friendly for typically small N)
    if (subs.indexOf(listener) !== -1) {
      if (IS_DEV) {
        console.warn(
          'Attempted to subscribe the same listener twice. Ignoring duplicate subscription.'
        );
      }
      return () => {};
    }

    subs.push(listener);
    this.flags |= flag;

    return () => {
      const idx = subs.indexOf(listener);
      if (idx === -1) return;

      const last = subs.pop()!;
      // Move the last element to current index to keep array dense (O(1) remove)
      if (idx < subs.length) {
        subs[idx] = last;
      }

      if (subs.length === 0) {
        this.flags &= ~flag;
      }
    };
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return this._fnSubs.length + this._objSubs.length;
  }

  /**
   * Notifies all subscribers of a change.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const flags = this.flags;
    // Early exit if no subscribers exist
    if (!(flags & (NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS))) return;

    if (flags & NODE_FLAGS.HAS_FN_SUBS) {
      const subs = this._fnSubs;
      // Use dynamic length check (i < subs.length) to safely handle self-unsubscribing listeners
      for (let i = 0; i < subs.length; i++) {
        try {
          subs[i]!(newValue, oldValue);
        } catch (err) {
          this._handleNotifyError(err);
        }
      }
    }

    if (flags & NODE_FLAGS.HAS_OBJ_SUBS) {
      const subs = this._objSubs;
      for (let i = 0; i < subs.length; i++) {
        try {
          subs[i]!.execute();
        } catch (err) {
          this._handleNotifyError(err);
        }
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
