import { AtomError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { Subscriber } from '../../types';
import type { SubscriberManager } from '../../utils/subscriber-manager';
import { ReactiveNode } from './reactive-node';

/**
 * Abstract base class for reactive nodes that can be dependencies (Atom, Computed).
 *
 * Extends ReactiveNode with versioning and subscriber management.
 *
 * Performance Note:
 * Abstract accessors are used for subscriber managers to allow subclasses
 * to define the actual storage fields *after* their own Smi fields.
 * This ensures all Smi fields (from Base, Dependency, and Subclass) are
 * packed together at the start of the object for V8 optimization.
 */
export abstract class ReactiveDependency extends ReactiveNode {
  // === Smi Fields (Continued from ReactiveNode) ===
  /** Version counter for change detection (Smi) */
  version: number;

  /** Last seen epoch for dependency collection (Smi) */
  _lastSeenEpoch: number;

  constructor() {
    super();
    this.version = 0;
    this._lastSeenEpoch = -1;
  }

  // === Abstract Accessors for Object Fields ===
  // Implemented by subclasses to control field layout
  protected abstract get _functionSubscribers(): SubscriberManager<
    (newValue?: any, oldValue?: any) => void
  >;
  protected abstract get _objectSubscribers(): SubscriberManager<Subscriber>;

  /**
   * Subscribes a listener function or Subscriber object to value changes.
   *
   * @param listener - Function or Subscriber object to call when the value changes
   * @returns An unsubscribe function
   * @throws {AtomError} If listener is not a function or Subscriber
   */
  subscribe(listener: ((newValue?: any, oldValue?: any) => void) | Subscriber): () => void {
    // Support Subscriber object for zero-allocation pattern
    if (typeof listener === 'object' && listener !== null && 'execute' in listener) {
      return this._objectSubscribers.add(listener);
    }

    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._functionSubscribers.add(listener);
  }

  /**
   * Gets the total number of active subscribers.
   */
  subscriberCount(): number {
    return this._functionSubscribers.size + this._objectSubscribers.size;
  }

  /**
   * Notifies all subscribers of a change.
   *
   * @param newValue - The new value
   * @param oldValue - The old value
   */
  protected _notifySubscribers(newValue: any, oldValue: any): void {
    this._functionSubscribers.forEachSafe(
      (sub) => sub(newValue, oldValue),
      (err) =>
        console.error(new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error))
    );

    this._objectSubscribers.forEachSafe(
      (sub) => sub.execute(),
      (err) =>
        console.error(new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, err as Error))
    );
  }
}
