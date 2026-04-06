import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { AtomError, ERROR_MESSAGES, wrapError } from '@/errors';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { type DepSlotBuffer, SlotBuffer } from './buffers';
import { Subscription } from './tracking';

/**
 * Unified base class for all reactive nodes (Atoms, Computeds, Effects).
 *
 * Optimized for V8 Hidden Class Monomorphism by having a single, consistent
 * object shape for all reactive logic.
 *
 * @template T - The type of value produced by this node (used for subscriptions).
 */
export abstract class ReactiveNode<T> {
  /** [Producer/Consumer] State flags */
  flags: number;
  /** [Producer/Consumer] Version counter */
  version: number;
  /** [Producer/Consumer] Last access epoch */
  _lastSeenEpoch: number;
  /** [Context] Scheduler epoch tag */
  _nextEpoch?: number;
  /** [Debug] Unique ID for identify node in tracking maps */
  readonly id: DependencyId;

  /**
   * [Producer] Managed subscribers.
   */
  _slots: SlotBuffer<Subscription<T>> | null;

  /** [Producer] Re-entry guard for notification loop. */
  _notifying: number;

  /**
   * [Consumer] Managed dependencies.
   */
  _deps: DepSlotBuffer | null;
  /** [Consumer] O(1) Hot-path dependency index for rapid dirty checks. */
  _hotIndex: number;

  constructor() {
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this._notifying = 0;
    this._hotIndex = -1;
    this._slots = null;
    this._deps = null;
    this.id = generateId() & SMI_MAX;
  }

  /**
   * Whether the node has been disposed.
   * @internal
   */
  get isDisposed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0; // Bit 0: DISPOSED
  }

  /**
   * Whether the node is a computed atom.
   * @internal
   */
  get isComputed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0; // Bit 1: IS_COMPUTED
  }

  /**
   * Whether the node currently has an error.
   * @internal
   */
  get hasError(): boolean {
    return false;
  }

  // ============================================================================
  // Producer Logic (Subscriber Management)
  // ============================================================================

  /**
   * Adds subscriber for notifications.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    if (!isFn && (!listener || typeof (listener as Subscriber).execute !== 'function')) {
      throw wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      );
    }

    let slots = this._slots;
    if (!slots) {
      slots = new SlotBuffer<Subscription<T>>();
      this._slots = slots;
    }

    // Duplicate check: Unrolled for performance + early exit
    let duplicate = false;
    if (slots._s0 != null && (isFn ? slots._s0.fn === listener : slots._s0.sub === listener)) {
      duplicate = true;
    } else if (
      slots._s1 != null &&
      (isFn ? slots._s1.fn === listener : slots._s1.sub === listener)
    ) {
      duplicate = true;
    } else if (
      slots._s2 != null &&
      (isFn ? slots._s2.fn === listener : slots._s2.sub === listener)
    ) {
      duplicate = true;
    } else if (
      slots._s3 != null &&
      (isFn ? slots._s3.fn === listener : slots._s3.sub === listener)
    ) {
      duplicate = true;
    } else {
      const ov = slots._overflow;
      if (ov != null) {
        for (let i = 0, len = ov.length; i < len; i++) {
          const s = ov[i];
          if (s != null && (isFn ? s.fn === listener : s.sub === listener)) {
            duplicate = true;
            break;
          }
        }
      }
    }

    if (duplicate) {
      if (IS_DEV) console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
      return () => {};
    }

    const link = new Subscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    slots.add(link);
    return () => this._unsubscribe(link);
  }

  protected _unsubscribe(link: Subscription<T>): void {
    const slots = this._slots;
    if (!slots) return;

    slots.remove(link);
    if (this._notifying === 0) {
      slots.compact();
    }
  }

  /**
   * Returns current subscriber count.
   */
  subscriberCount(): number {
    const slots = this._slots;
    return slots === null ? 0 : slots.size;
  }

  /**
   * Notifies all subscribers about a value update.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const slots = this._slots;
    if (slots === null || slots.size === 0) return;

    this._notifying++;
    try {
      // 1. Inline slots: Manual unroll to avoid closure allocation
      let s = slots._s0;
      if (s != null) {
        try {
          s.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }
      s = slots._s1;
      if (s != null) {
        try {
          s.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }
      s = slots._s2;
      if (s != null) {
        try {
          s.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }
      s = slots._s3;
      if (s != null) {
        try {
          s.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }

      // 2. Overflow scan: Standard loop for performance
      const ov = slots._overflow;
      if (ov != null) {
        for (let i = 0, len = ov.length; i < len; i++) {
          const sub = ov[i];
          if (sub != null) {
            try {
              sub.notify(newValue, oldValue);
            } catch (e) {
              this._logNotifyError(e);
            }
          }
        }
      }
    } finally {
      if (--this._notifying === 0) {
        slots.compact();
      }
    }
  }

  private _logNotifyError(err: unknown): void {
    console.error(wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
  }

  // ============================================================================
  // Consumer Logic (Dependency Validation)
  // ============================================================================

  /**
   * Determines if the node is dirty by checking its dependency chain.
   * Optimized with O(1) hot-path check.
   */
  protected _isDirty(): boolean {
    const deps = this._deps;
    if (deps === null || deps.size === 0) return false;

    // Phase 1: Hot-path Check - O(1)
    const hotIndex = this._hotIndex;
    if (hotIndex !== -1) {
      const hotLink = deps.getAt(hotIndex);
      if (hotLink != null && hotLink.node.version !== hotLink.version) {
        return true;
      }
    }

    // Phase 2: Standard Validation - O(N)
    if (!deps.hasComputeds && !deps.isDirtyFast()) return false;

    // Deep check for computeds
    return this._deepDirtyCheck();
  }

  /**
   * Deeply validates dependency versions.
   */
  protected abstract _deepDirtyCheck(): boolean;
}
