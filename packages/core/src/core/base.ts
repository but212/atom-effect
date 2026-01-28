import { IS_DEV, NODE_FLAGS, SMI_MAX } from '@/constants';
import { SubscriberLink } from '@/core/dep-tracking';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes.
 */
export class ReactiveNode {
  /** Bitfield for state flags (DIRTY, VISITED, etc) */
  flags = 0;
  /** Monotonic change counter */
  version = 0;
  /** Epoch of last access/update */
  _lastSeenEpoch = -1;
  /** Epoch of last modification (for cycle detection) */
  _modifiedAtEpoch = -1;
  /** Unique ID for heap snapshots/debugging */
  readonly id: DependencyId = (generateId() & SMI_MAX) as DependencyId;
  /** Transient slot for O(1) unsubscribing during link swaps */
  _tempUnsub: (() => void) | undefined = undefined;
}

/**
 * Abstract base class for reactive dependencies (Atoms, Computed).
 * Handles the "Source" side of the dependency graph (managing subscribers).
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected abstract _subscribers: SubscriberLink<T>[];

  /**
   * Adds a subscriber (sink) to this dependency (source).
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    // Structural type check for object subscribers
    if (!isFn && (!listener || typeof (listener as Subscriber).execute !== 'function')) {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }

    const subs = this._subscribers;

    // De-duplication check (O(N) - usually N is small)
    for (let i = 0, len = subs.length; i < len; i++) {
      const sub = subs[i];
      if (!sub) continue;
      if (isFn ? sub.fn === listener : sub.sub === listener) {
        if (IS_DEV) console.warn('Duplicate subscription ignored.');
        return () => {};
      }
    }

    const link = new SubscriberLink<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    subs.push(link);
    this.flags |= isFn ? NODE_FLAGS.HAS_FN_SUBS : NODE_FLAGS.HAS_OBJ_SUBS;

    return () => this._unsubscribe(link, isFn);
  }

  private _unsubscribe(link: SubscriberLink<T>, isFn: boolean): void {
    const subs = this._subscribers;
    const idx = subs.indexOf(link);
    if (idx === -1) return;

    // Fast Remove (Swap & Pop) - O(1)
    const last = subs.pop();
    if (idx < subs.length && last) {
      subs[idx] = last;
    }

    if (subs.length === 0) {
      this.flags &= ~(NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS);
    } else {
      // Re-scan flags if needed (rare path)
      this._updateSubscriberFlags(isFn);
    }
  }

  private _updateSubscriberFlags(checkFn: boolean): void {
    const subs = this._subscribers;
    let hasType = false;
    for (let i = 0, len = subs.length; i < len; i++) {
      const sub = subs[i];
      if (sub && (checkFn ? sub.fn : sub.sub)) {
        hasType = true;
        break;
      }
    }
    if (!hasType) {
      this.flags &= checkFn ? ~NODE_FLAGS.HAS_FN_SUBS : ~NODE_FLAGS.HAS_OBJ_SUBS;
    }
  }

  subscriberCount(): number {
    return this._subscribers.length;
  }

  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    if (!(this.flags & (NODE_FLAGS.HAS_FN_SUBS | NODE_FLAGS.HAS_OBJ_SUBS))) return;

    const subs = this._subscribers;
    const len = subs.length;

    for (let i = 0; i < len; i++) {
      const s = subs[i];
      if (!s) continue;

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
