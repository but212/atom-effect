/**
 * @fileoverview Synchronous computation and error handlers for computed atoms
 * @description Handles sync computation results and errors with state updates
 * @module computed-handlers
 *
 * This module provides three main classes:
 * - SyncComputationHandler: Handles synchronous computation results with value comparison
 * - ComputationErrorHandler: Handles computation errors with state management
 * - StateValueHandlers: Provides state-specific value access handling
 *
 * @example
 * ```ts
 * const syncHandler = new SyncComputationHandler(stateFlags, equal, notify);
 * syncHandler.handle(result, getValue, setValue, setError);
 *
 * const errorHandler = new ComputationErrorHandler(stateFlags, onError);
 * errorHandler.handle(error, setError); // throws after handling
 *
 * const valueHandlers = new StateValueHandlers(stateFlags, defaultValue, true);
 * const value = valueHandlers.handlePending();
 * ```
 */

import type { AtomError } from '../../errors/errors';
import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { NO_DEFAULT_VALUE } from '../../utils/debug';
import type { ComputedStateFlags } from './computed-state-flags';

/**
 * Synchronous computation result handler for computed atoms.
 *
 * @description
 * Manages the lifecycle of synchronous computation results:
 * 1. Compares new result with cached value using equality function
 * 2. Updates the cached value
 * 3. Clears dirty flag and sets resolved state
 * 4. Clears any previous error
 * 5. Notifies subscribers if value changed
 *
 * @template T - The type of value produced by the computation
 *
 * @remarks
 * - Uses equality function to prevent unnecessary subscriber notifications
 * - State transitions: DIRTY → RESOLVED
 * - Subscribers are only notified when value actually changes
 *
 * @example
 * ```ts
 * const handler = new SyncComputationHandler<number>(
 *   stateFlags,
 *   (a, b) => a === b, // equality function
 *   () => notifyAllSubscribers() // notification callback
 * );
 *
 * handler.handle(
 *   computedResult,
 *   () => cachedValue,
 *   (value) => { cachedValue = value; },
 *   (error) => { lastError = error; }
 * );
 * ```
 */
export class SyncComputationHandler<T> {
  /**
   * Creates a new SyncComputationHandler instance.
   *
   * @param stateFlags - State manager for tracking computation status
   * @param equal - Equality function to compare values and prevent unnecessary updates
   * @param notifySubscribers - Callback to notify subscribers of value changes
   */
  constructor(
    private stateFlags: ComputedStateFlags,
    private equal: (a: T, b: T) => boolean,
    private notifySubscribers: () => void
  ) {}

  /**
   * Handles a synchronous computation result.
   *
   * @description
   * Processes the result of a synchronous computation:
   * 1. Determines if the value has changed (using equality function)
   * 2. Updates the cached value
   * 3. Clears dirty flag and sets resolved state
   * 4. Clears any previous error
   * 5. Notifies subscribers if value changed
   *
   * @param result - The computed result value
   * @param getValue - Getter function for the current cached value
   * @param setValue - Setter function for updating the cached value
   * @param setError - Setter function for error state (cleared on success)
   *
   * @example
   * ```ts
   * handler.handle(
   *   calculateTotal(items),
   *   () => cachedTotal,
   *   (total) => { cachedTotal = total; },
   *   (error) => { lastError = error; }
   * );
   * ```
   */
  handle(
    result: T,
    getValue: () => T,
    setValue: (value: T) => void,
    setError: (error: AtomError | null) => void
  ): void {
    const shouldUpdate = !this.stateFlags.isResolved() || !this.equal(getValue(), result);

    setValue(result);
    this.stateFlags.clearDirty();
    this.stateFlags.setResolved();
    setError(null);
    this.stateFlags.setRecomputing(false);

    if (shouldUpdate) {
      this.notifySubscribers();
    }
  }
}

/**
 * Error handler for computation failures in computed atoms.
 *
 * @description
 * Manages error handling for failed computations:
 * 1. Wraps the error in a ComputedError for consistent error handling
 * 2. Sets the error state
 * 3. Updates state flags to rejected
 * 4. Invokes the onError callback if provided
 * 5. Re-throws the error after handling
 *
 * @remarks
 * - Always re-throws the error after handling (return type is `never`)
 * - Errors in the onError callback are caught and logged to prevent cascading failures
 * - State transitions: DIRTY → REJECTED
 *
 * @example
 * ```ts
 * const handler = new ComputationErrorHandler(
 *   stateFlags,
 *   (error) => console.error('Computation failed:', error)
 * );
 *
 * try {
 *   // ... computation logic
 * } catch (err) {
 *   handler.handle(err, setError); // throws after handling
 * }
 * ```
 */
export class ComputationErrorHandler {
  /**
   * Creates a new ComputationErrorHandler instance.
   *
   * @param stateFlags - State manager for tracking computation status
   * @param onError - Optional error callback invoked when errors occur
   */
  constructor(
    private stateFlags: ComputedStateFlags,
    private onError: ((error: Error) => void) | null
  ) {}

  /**
   * Handles a computation error.
   *
   * @description
   * Processes a computation error:
   * 1. Wraps the error in a ComputedError
   * 2. Sets the error state via setError callback
   * 3. Updates state flags to rejected
   * 4. Invokes onError callback if provided
   * 5. Re-throws the wrapped error
   *
   * @param err - The error/exception from the failed computation
   * @param setError - Setter function for error state
   * @returns Never returns - always throws
   * @throws ComputedError - The wrapped error after state updates
   *
   * @remarks
   * Errors in the onError callback are caught and logged to prevent
   * cascading failures from masking the original error.
   *
   * @example
   * ```ts
   * try {
   *   const result = expensiveComputation();
   * } catch (err) {
   *   errorHandler.handle(err, (error) => { lastError = error; });
   *   // Code here is unreachable
   * }
   * ```
   */
  handle(err: unknown, setError: (error: AtomError | null) => void): never {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED);

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

    throw error;
  }
}

/**
 * State-specific value handlers for computed atoms.
 *
 * @description
 * Provides specialized handling for value access based on current state:
 * - RECOMPUTING: Returns current cached value (stale read)
 * - PENDING: Returns default value or throws if none available
 * - REJECTED: Returns default value for recoverable errors, otherwise throws
 *
 * @template T - The type of value managed by the computed atom
 *
 * @remarks
 * - Default values enable graceful degradation during async operations
 * - Recoverable errors allow fallback to default values
 * - Non-recoverable errors always propagate to the caller
 *
 * @example
 * ```ts
 * const handlers = new StateValueHandlers<User>(
 *   stateFlags,
 *   { id: 0, name: 'Loading...' }, // default value
 *   true // hasDefaultValue
 * );
 *
 * // During async computation
 * if (stateFlags.isPending()) {
 *   return handlers.handlePending(); // Returns default user
 * }
 *
 * // After failed computation
 * if (stateFlags.isRejected()) {
 *   return handlers.handleRejected(error); // Returns default or throws
 * }
 * ```
 */
export class StateValueHandlers<T> {
  /**
   * Creates a new StateValueHandlers instance.
   *
   * @param stateFlags - State manager for tracking computation status
   * @param defaultValue - Default value to use when actual value is unavailable
   * @param hasDefaultValue - Whether a valid default value was provided
   */
  constructor(
    private stateFlags: ComputedStateFlags,
    private defaultValue: T,
    private hasDefaultValue: boolean
  ) {}

  /**
   * Handles value access during recomputing state.
   *
   * @description
   * Returns the current cached value during recomputation.
   * This allows stale reads while a new computation is in progress,
   * preventing blocking behavior.
   *
   * @param currentValue - The current cached value
   * @returns The current cached value (may be stale)
   *
   * @example
   * ```ts
   * if (stateFlags.isRecomputing()) {
   *   return handlers.handleRecomputing(cachedValue);
   * }
   * ```
   */
  handleRecomputing(currentValue: T): T {
    return currentValue;
  }

  /**
   * Handles value access during pending state (async computation in progress).
   *
   * @description
   * Returns the default value if available, otherwise throws an error.
   * This enables graceful handling of async computations by providing
   * a fallback value while waiting for the Promise to resolve.
   *
   * @returns The default value if available
   * @throws ComputedError - If no default value is configured
   *
   * @example
   * ```ts
   * // With default value
   * const handlers = new StateValueHandlers(stateFlags, 'Loading...', true);
   * handlers.handlePending(); // Returns 'Loading...'
   *
   * // Without default value
   * const handlers = new StateValueHandlers(stateFlags, undefined, false);
   * handlers.handlePending(); // Throws ComputedError
   * ```
   */
  handlePending(): T {
    if (this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
  }

  /**
   * Handles value access during rejected state (computation failed).
   *
   * @description
   * Determines how to handle a failed computation:
   * - If error is recoverable AND default value exists: returns default
   * - Otherwise: re-throws the error
   *
   * This enables graceful degradation for transient failures while
   * ensuring critical errors propagate to the caller.
   *
   * @param error - The error from the failed computation
   * @returns The default value if error is recoverable and default exists
   * @throws The original error if not recoverable or no default value
   *
   * @example
   * ```ts
   * // Recoverable error with default
   * const handlers = new StateValueHandlers(stateFlags, fallbackData, true);
   * handlers.handleRejected(recoverableError); // Returns fallbackData
   *
   * // Non-recoverable error
   * handlers.handleRejected(criticalError); // Throws criticalError
   * ```
   */
  handleRejected(error: AtomError | null): T {
    if (error?.recoverable && this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw error;
  }

  /**
   * Checks if a default value is set (not the sentinel NO_DEFAULT_VALUE).
   *
   * @description
   * Utility method to determine if a provided default value is valid.
   * Uses the NO_DEFAULT_VALUE sentinel to distinguish between an
   * explicitly set default and no default being provided.
   *
   * @param defaultValue - The default value to check
   * @returns true if a valid default value is set, false otherwise
   *
   * @example
   * ```ts
   * StateValueHandlers.hasDefault(undefined); // true (undefined is valid)
   * StateValueHandlers.hasDefault(null); // true (null is valid)
   * StateValueHandlers.hasDefault(NO_DEFAULT_VALUE); // false
   * StateValueHandlers.hasDefault('fallback'); // true
   * ```
   */
  static hasDefault<T>(defaultValue: T): boolean {
    return defaultValue !== NO_DEFAULT_VALUE;
  }
}
