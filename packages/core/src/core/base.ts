import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV } from '@/constants';
import { AtomError, ERROR_MESSAGES, wrapError } from '@/errors';
import { DEBUG_NAME, DEBUG_TYPE } from '@/symbols';
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
  /** [Debug] Human-readable identifier. */
  [DEBUG_NAME]?: string;
  /** [Debug] Node type (e.g., 'atom', 'computed'). */
  [DEBUG_TYPE]?: string;

  /** [Producer/Consumer] State flags */
  flags: number;
  /** [Producer/Consumer] Version counter */
  version: number;
  /** [Producer/Consumer] Last access epoch */
  _lastSeenEpoch: number;
  /** [Context] Scheduler epoch tag */
  _nextEpoch: number | undefined;
  /** [Debug] Unique ID for identify node in tracking maps */
  readonly id: DependencyId;

  // ── Producer Properties (Subscriber Management) ───────────────────────────

  /** Managed subscribers. */
  _slots: SlotBuffer<Subscription<T>> | null = null;
  /** Re-entry guard for notification loop. */
  _notifying = 0;

  // ── Consumer Properties (Dependency Management) ───────────────────────────

  /** Managed dependencies. */
  _deps: DepSlotBuffer | null = null;
  /** O(1) Hot-path dependency index for rapid dirty checks. */
  _hotIndex = -1;

  constructor() {
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this.id = generateId();
    this._nextEpoch = undefined;
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
    return (this.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) !== 0;
  }

  // ============================================================================
  // Producer Logic (Subscriber Management)
  // ============================================================================

  /**
   * Adds subscriber for notifications.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    if (this.isDisposed) return () => {};

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
      slots = this._slots = new SlotBuffer<Subscription<T>>();
    }

    if (this._isAlreadySubscribed(slots, listener, isFn)) {
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
      if (slots.size === 0) {
        this._slots = null;
      }
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
      this._safeNotify(slots._s0, newValue, oldValue);
      this._safeNotify(slots._s1, newValue, oldValue);
      this._safeNotify(slots._s2, newValue, oldValue);
      this._safeNotify(slots._s3, newValue, oldValue);

      // 2. Overflow scan: Standard loop
      const ov = slots._overflow;
      if (ov !== null) {
        for (let i = 0, len = ov.length; i < len; i++) {
          this._safeNotify(ov[i], newValue, oldValue);
        }
      }
    } finally {
      if (--this._notifying === 0) {
        slots.compact();
        if (slots.size === 0) {
          this._slots = null;
        }
      }
    }
  }

  private _safeNotify(
    sub: Subscription<T> | null | undefined,
    newValue: T | undefined,
    oldValue: T | undefined
  ): void {
    if (sub == null) return;
    try {
      sub.notify(newValue, oldValue);
    } catch (e) {
      console.error(wrapError(e, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
    }
  }

  private _isAlreadySubscribed(
    slots: SlotBuffer<Subscription<T>>,
    listener: ((newValue?: T, oldValue?: T) => void) | Subscriber,
    isFn: boolean
  ): boolean {
    const s0 = slots._s0;
    if (s0 != null && (isFn ? s0.fn === listener : s0.sub === listener)) return true;
    const s1 = slots._s1;
    if (s1 != null && (isFn ? s1.fn === listener : s1.sub === listener)) return true;
    const s2 = slots._s2;
    if (s2 != null && (isFn ? s2.fn === listener : s2.sub === listener)) return true;
    const s3 = slots._s3;
    if (s3 != null && (isFn ? s3.fn === listener : s3.sub === listener)) return true;

    const ov = slots._overflow;
    if (ov !== null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const s = ov[i];
        if (s != null && (isFn ? s.fn === listener : s.sub === listener)) return true;
      }
    }
    return false;
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
    return this._deepDirtyCheck();
  }

  /**
   * Deeply validates dependency versions.
   */
  protected abstract _deepDirtyCheck(): boolean;
}
