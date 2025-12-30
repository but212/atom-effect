/**
 * @fileoverview Synchronous computation and error handlers
 * @description Handles sync computation results and errors with state updates
 */

import type { AtomError } from '../../errors/errors';
import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { NO_DEFAULT_VALUE } from '../../utils/debug';
import type { ComputedStateFlags } from './computed-state-flags';

/**
 * Synchronous computation result handler
 */
export class SyncComputationHandler<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private equal: (a: T, b: T) => boolean,
    private notifySubscribers: () => void
  ) {}

  /**
   * Handles synchronous computation result
   * @param result Computed result
   * @param getValue Getter for current value
   * @param setValue Setter for new value
   * @param setError Setter for error
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
 * Error handler for computation failures
 */
export class ComputationErrorHandler {
  constructor(
    private stateFlags: ComputedStateFlags,
    private onError: ((error: Error) => void) | null
  ) {}

  /**
   * Handles synchronous computation error
   * @param err Error object
   * @param setError Setter for error
   * @throws Always throws the error after handling
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
 * State-specific value handlers for computed atoms
 */
export class StateValueHandlers<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private defaultValue: T,
    private hasDefaultValue: boolean
  ) {}

  /**
   * Handles value access during recomputing state
   * @param currentValue Current cached value
   * @returns Current value
   */
  handleRecomputing(currentValue: T): T {
    return currentValue;
  }

  /**
   * Handles value access during pending state
   * @returns Default value if available
   * @throws ComputedError if no default value
   */
  handlePending(): T {
    if (this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
  }

  /**
   * Handles value access during rejected state
   * @param error Error object from failed computation
   * @returns Default value if error is recoverable and default exists
   * @throws Error if not recoverable or no default value
   */
  handleRejected(error: AtomError | null): T {
    if (error?.recoverable && this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw error;
  }

  /**
   * Checks if default value is set
   * @param defaultValue Default value to check
   * @returns true if default value is set
   */
  static hasDefault<T>(defaultValue: T): boolean {
    return defaultValue !== NO_DEFAULT_VALUE;
  }
}
