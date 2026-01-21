import { SMI_MAX } from '@/constants';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes (Atoms, Computed, Effects).
 *
 * Optimized for V8 hidden classes:
 * - Initializes Smi (Small Integer) fields first.
 * - Provides common identity, flag, and version management.
 *
 * Phase-Shift Versioning:
 * - version uses 30-bit structure (10-bit Cycle + 20-bit Phase)
 * - Enables branchless operations for version comparison and priority calculation
 */
export class ReactiveNode {
  /** Internal flags (Smi) for state management (Disposed, Dirty, etc.) */
  flags: number;

  /**
   * Version counter using phase-shift encoding (Smi).
   * Upper 10 bits = Cycle (rotation count), Lower 20 bits = Phase (angle)
   * Enables branchless comparison and priority calculation.
   */
  version: number;

  /** Last seen epoch for dependency collection (Smi) */
  _lastSeenEpoch: number;

  /** Unique numerical identifier (Smi) */
  readonly id: DependencyId;

  constructor() {
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = -1;
    this.id = (generateId() & SMI_MAX) as DependencyId;
  }

  /**
   * Rotates the phase by 1, automatically incrementing cycle on overflow.
   *
   * Performance Benefits:
   * - Branchless: No conditional statements
   * - O(1): Single bitwise AND operation
   * - Smi-safe: Result always within 30-bit range (0x3fffffff)
   *
   * When Phase reaches 0xfffff (1,048,575), the next increment:
   * - Overflows into Cycle bits
   * - Phase resets to 0
   * - Cycle increments by 1
   *
   * @returns The new version after phase rotation
   */
  protected rotatePhase(): number {
    this.version = (this.version + 1) & SMI_MAX;
    return this.version;
  }

  /**
   * Calculates the logical distance (shift) between current and cached version.
   *
   * Uses modular arithmetic to handle cycle wraparound correctly.
   * The result represents how many phase rotations have occurred since
   * the cached version was recorded.
   *
   * Performance Benefits:
   * - Branchless: Single subtraction with mask
   * - Handles wraparound: Works correctly even when version overflows
   *
   * Use Cases:
   * - Scheduler priority: Large shifts indicate stale updates
   * - Dependency staleness: Detect how outdated a cached value is
   *
   * @param cachedVersion - The previously cached version to compare against
   * @returns Non-negative shift distance (0 to 0x3fffffff)
   */
  getShift(cachedVersion: number): number {
    return (this.version - cachedVersion) & SMI_MAX;
  }
}

/**
 * Abstract base class for reactive nodes that can be dependencies (Atom, Computed).
 *
 * Extends ReactiveNode with subscriber management capabilities.
 * Inherits phase-shift versioning from ReactiveNode.
 *
 * Performance Note:
 * Storage fields for subscribers are defined in subclasses but managed here
 * to ensure optimal object shape. Subclasses should initialize _fnSubs and _objSubs.
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  /** Array of function-based subscribers */
  protected abstract _fnSubs: ((newValue?: T, oldValue?: T) => void)[] | null;
  /** Array of object-based subscribers */
  protected abstract _objSubs: Subscriber[] | null;

  /**
   * Subscribes a listener function or Subscriber object to value changes.
   *
   * @param listener - Function or Subscriber object to call when the value changes
   * @returns An unsubscribe function
   * @throws {AtomError} If listener is not a function or Subscriber
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    if (typeof listener === 'object' && listener !== null && 'execute' in listener) {
      return this._addSubscriber(this._getObjSubs(), listener);
    }

    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._addSubscriber(this._getFnSubs(), listener);
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return (this._fnSubs?.length ?? 0) + (this._objSubs?.length ?? 0);
  }

  protected abstract _getFnSubs(): ((newValue?: T, oldValue?: T) => void)[];
  protected abstract _getObjSubs(): Subscriber[];

  private _addSubscriber<S>(subs: S[], subscriber: S): () => void {
    if (subs.indexOf(subscriber) !== -1) return () => {};

    subs.push(subscriber);

    let isUnsubscribed = false;
    return () => {
      if (isUnsubscribed) return;
      isUnsubscribed = true;

      const idx = subs.indexOf(subscriber);
      if (idx !== -1) {
        const lastIndex = subs.length - 1;
        if (idx !== lastIndex) {
          subs[idx] = subs[lastIndex]!;
        }
        subs.pop();
      }
    };
  }

  /**
   * Notifies all subscribers of a change.
   *
   * @param newValue - The new value
   * @param oldValue - The old value
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const fnSubs = this._fnSubs;
    if (fnSubs) {
      for (let i = fnSubs.length - 1; i >= 0; i--) {
        try {
          const sub = fnSubs[i];
          if (sub) sub(newValue, oldValue);
        } catch (err) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
          );
        }
      }
    }

    const objSubs = this._objSubs;
    if (objSubs) {
      for (let i = objSubs.length - 1; i >= 0; i--) {
        try {
          const sub = objSubs[i];
          if (sub) sub.execute();
        } catch (err) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error)
          );
        }
      }
    }
  }
}
