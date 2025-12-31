/**
 * @fileoverview Async computation handler for computed atoms
 * @description Handles Promise-based asynchronous computations with race condition prevention
 * @module computed-async-handler
 *
 * This module provides two main classes:
 * - PromiseIdManager: Manages unique IDs for Promise tracking to prevent race conditions
 * - AsyncComputationHandler: Handles async computation lifecycle (pending → resolved/rejected)
 *
 * Race Condition Prevention:
 * When multiple async computations are triggered in quick succession, only the most recent
 * computation's result should be applied. This is achieved by assigning unique IDs to each
 * computation and validating the ID before applying results.
 *
 * @example
 * ```ts
 * const promiseIdManager = new PromiseIdManager();
 * const handler = new AsyncComputationHandler(stateFlags, promiseIdManager, equal, onError, notify);
 *
 * // Each call to handle() gets a unique ID
 * handler.handle(fetchData(), getValue, setValue, setError);
 * // If called again before first resolves, first result will be ignored
 * handler.handle(fetchData(), getValue, setValue, setError);
 * ```
 */

import type { AtomError } from '../../errors/errors';
import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { ComputedStateFlags } from './computed-state-flags';

/**
 * Promise ID manager to prevent race conditions in async computed values.
 *
 * @description
 * Generates and tracks unique IDs for async computations. When a new computation
 * starts, it receives a new ID. If a previous computation completes after a newer
 * one has started, its ID will no longer be valid, and its result will be discarded.
 *
 * @remarks
 * - IDs are monotonically increasing integers
 * - Overflow protection wraps around at MAX_SAFE_INTEGER
 * - Thread-safe for single-threaded JavaScript execution
 *
 * @example
 * ```ts
 * const manager = new PromiseIdManager();
 *
 * const id1 = manager.next(); // 1
 * const id2 = manager.next(); // 2
 *
 * manager.isValid(id1); // false - superseded by id2
 * manager.isValid(id2); // true - current ID
 *
 * manager.invalidate(); // Increments to 3, invalidating id2
 * ```
 */
export class PromiseIdManager {
  /**
   * The most recently generated Promise ID.
   * Used to track the current/latest computation.
   * @private
   */
  private lastPromiseId = 0;

  /**
   * Maximum allowed Promise ID before overflow wrap-around.
   * Set to MAX_SAFE_INTEGER - 1 to ensure safe increment operations.
   * @private
   * @readonly
   */
  private readonly MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

  /**
   * Generates the next unique Promise ID with overflow protection.
   *
   * @description
   * Increments the internal counter and returns the new ID.
   * If the counter reaches MAX_SAFE_INTEGER, it wraps around to 0
   * to prevent integer overflow issues.
   *
   * @returns A new unique Promise ID
   *
   * @example
   * ```ts
   * const manager = new PromiseIdManager();
   * const id = manager.next(); // Returns 1, 2, 3, ...
   * ```
   */
  next(): number {
    // Prevent Promise ID overflow (wrap around at MAX_SAFE_INTEGER)
    if (this.lastPromiseId >= this.MAX_PROMISE_ID) {
      this.lastPromiseId = 0;
    }
    return ++this.lastPromiseId;
  }

  /**
   * Gets the current (most recent) Promise ID without incrementing.
   *
   * @description
   * Returns the ID of the most recently started computation.
   * Useful for checking the current state without side effects.
   *
   * @returns The current Promise ID
   *
   * @example
   * ```ts
   * const manager = new PromiseIdManager();
   * manager.next(); // 1
   * manager.current(); // 1 (doesn't increment)
   * ```
   */
  current(): number {
    return this.lastPromiseId;
  }

  /**
   * Checks if a Promise ID is still valid (not superseded by newer computation).
   *
   * @description
   * A Promise ID is valid only if it matches the current ID, meaning no newer
   * computation has been started since this ID was generated.
   *
   * @param id - The Promise ID to validate
   * @returns true if the ID is current and valid, false if superseded
   *
   * @example
   * ```ts
   * const manager = new PromiseIdManager();
   * const id1 = manager.next(); // 1
   * manager.isValid(id1); // true
   *
   * const id2 = manager.next(); // 2
   * manager.isValid(id1); // false - superseded
   * manager.isValid(id2); // true
   * ```
   */
  isValid(id: number): boolean {
    return id === this.lastPromiseId;
  }

  /**
   * Invalidates all previous computations by incrementing the Promise ID.
   *
   * @description
   * Call this method to cancel/ignore results from all pending computations.
   * Useful when manually triggering a recomputation or during cleanup.
   *
   * @example
   * ```ts
   * const manager = new PromiseIdManager();
   * const id = manager.next();
   * manager.isValid(id); // true
   *
   * manager.invalidate();
   * manager.isValid(id); // false - invalidated
   * ```
   */
  invalidate(): void {
    this.next();
  }
}

/**
 * Async computation handler for computed atoms.
 *
 * @description
 * Manages the complete lifecycle of asynchronous computations:
 * 1. Sets pending state when computation starts
 * 2. Handles successful resolution with value updates
 * 3. Handles rejection with error state management
 * 4. Prevents race conditions using PromiseIdManager
 * 5. Notifies subscribers of state changes
 *
 * @template T - The type of value produced by the async computation
 *
 * @remarks
 * - Only the most recent computation's result is applied
 * - State transitions: IDLE → PENDING → RESOLVED | REJECTED
 * - Subscribers are notified on value changes and errors
 * - Custom error handlers are supported via onError callback
 *
 * @example
 * ```ts
 * const handler = new AsyncComputationHandler<User>(
 *   stateFlags,
 *   promiseIdManager,
 *   (a, b) => a.id === b.id, // equality function
 *   (error) => console.error(error), // error handler
 *   () => notifyAllSubscribers() // notification callback
 * );
 *
 * // Handle an async computation
 * handler.handle(
 *   fetchUser(userId),
 *   () => currentUser,
 *   (user) => { currentUser = user; },
 *   (error) => { lastError = error; }
 * );
 * ```
 */
export class AsyncComputationHandler<T> {
  /**
   * Creates a new AsyncComputationHandler instance.
   *
   * @param stateFlags - State manager for tracking computation status
   * @param promiseIdManager - Manager for race condition prevention
   * @param equal - Equality function to compare values
   * @param onError - Optional error callback
   * @param notifySubscribers - Callback to notify subscribers of changes
   */
  constructor(
    private stateFlags: ComputedStateFlags,
    private promiseIdManager: PromiseIdManager,
    private equal: (a: T, b: T) => boolean,
    private onError: ((error: Error) => void) | null,
    private notifySubscribers: () => void
  ) {}

  /**
   * Handles an async computation Promise.
   *
   * @description
   * Initiates handling of a Promise-based computation:
   * 1. Sets state to PENDING
   * 2. Generates a unique Promise ID for race condition tracking
   * 3. Attaches then/catch handlers for resolution/rejection
   * 4. Validates Promise ID before applying results
   *
   * @param result - The Promise to handle
   * @param getValue - Getter function for the current cached value
   * @param setValue - Setter function for updating the cached value
   * @param setError - Setter function for error state
   *
   * @example
   * ```ts
   * handler.handle(
   *   fetch('/api/data').then(r => r.json()),
   *   () => cachedData,
   *   (data) => { cachedData = data; },
   *   (error) => { lastError = error; }
   * );
   * ```
   */
  handle(
    result: Promise<T>,
    getValue: () => T,
    setValue: (value: T) => void,
    setError: (error: AtomError | null) => void
  ): void {
    this.stateFlags.setPending();

    const promiseId = this.promiseIdManager.next();

    result
      .then((resolvedValue) => {
        // Race condition check: ignore if superseded by newer computation
        if (!this.promiseIdManager.isValid(promiseId)) return;

        this.handleResolution(resolvedValue, getValue, setValue, setError);
      })
      .catch((err) => {
        // Race condition check: ignore if superseded by newer computation
        if (!this.promiseIdManager.isValid(promiseId)) return;

        this.handleRejection(err, setError);
      });
  }

  /**
   * Handles successful Promise resolution.
   *
   * @description
   * Called when an async computation completes successfully:
   * 1. Determines if the value has changed (using equality function)
   * 2. Updates the cached value
   * 3. Clears dirty flag and sets resolved state
   * 4. Clears any previous error
   * 5. Notifies subscribers if value changed
   *
   * @private
   * @param resolvedValue - The resolved value from the Promise
   * @param getValue - Getter for current cached value
   * @param setValue - Setter for cached value
   * @param setError - Setter for error state
   */
  private handleResolution(
    resolvedValue: T,
    getValue: () => T,
    setValue: (value: T) => void,
    setError: (error: AtomError | null) => void
  ): void {
    const shouldUpdate = !this.stateFlags.isResolved() || !this.equal(getValue(), resolvedValue);

    setValue(resolvedValue);
    this.stateFlags.clearDirty();
    this.stateFlags.setResolved();
    setError(null);
    this.stateFlags.setRecomputing(false);

    if (shouldUpdate) {
      this.notifySubscribers();
    }
  }

  /**
   * Handles Promise rejection.
   *
   * @description
   * Called when an async computation fails:
   * 1. Wraps the error in a ComputedError for consistent error handling
   * 2. Sets the error state
   * 3. Updates state flags to rejected
   * 4. Invokes the onError callback if provided
   * 5. Notifies subscribers of the error state
   *
   * @private
   * @param err - The error/rejection reason from the Promise
   * @param setError - Setter for error state
   *
   * @remarks
   * Errors in the onError callback are caught and logged to prevent
   * cascading failures.
   */
  private handleRejection(err: unknown, setError: (error: AtomError | null) => void): void {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);

    setError(error);
    this.stateFlags.setRejected();
    this.stateFlags.clearDirty();
    this.stateFlags.setRecomputing(false);

    if (this.onError && typeof this.onError === 'function') {
      try {
        this.onError(error);
      } catch (callbackError) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, callbackError);
      }
    }

    this.notifySubscribers();
  }
}
