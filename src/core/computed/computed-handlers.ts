import type { AtomError } from '@/errors/errors';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { NO_DEFAULT_VALUE } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import type { ComputedStateFlags } from './computed-state-flags';

/**
 * Handles synchronous computation results.
 * Manages value updates, dirty flag clearing, and subscriber notifications with value comparison.
 */
export class SyncComputationHandler<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private equal: (a: T, b: T) => boolean,
    private notifySubscribers: () => void
  ) {}

  /**
   * Processes the result of a sync computation.
   * @param result - The computed value.
   * @param getValue - Function to get the current stored value for comparison.
   * @param setValue - Function to update the stored value.
   * @param setError - Function to clear or set computation errors.
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
 * Handles errors occurring during computation.
 * Ensures the state is updated to REJECTED and re-throws the error.
 */
export class ComputationErrorHandler {
  constructor(
    private stateFlags: ComputedStateFlags,
    private onError: ((error: Error) => void) | null
  ) {}

  /**
   * Processes a computation error.
   * @param err - The raw error caught.
   * @param setError - Function to store the error in the computed node.
   * @throws {ComputedError} Always re-throws the wrapped error.
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
 * Provides state-specific handling for value access.
 * Determines how to return a value based on whether the state is recomputing, pending, or rejected.
 */
export class StateValueHandlers<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private defaultValue: T,
    private hasDefaultValue: boolean
  ) {}

  /** Handles access while recomputing (returns current cached value) */
  handleRecomputing(currentValue: T): T {
    return currentValue;
  }

  /**
   * Handles access while the state is PENDING.
   * @throws {ComputedError} If no default value is provided.
   */
  handlePending(): T {
    if (this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
  }

  /**
   * Handles access while the state is REJECTED.
   * @param error - The error that caused rejection.
   * @throws {AtomError} If the error is not recoverable or no default value exists.
   */
  handleRejected(error: AtomError | null): T {
    if (error?.recoverable && this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw error;
  }

  /** Checks if a provided value is a valid default value (not NO_DEFAULT_VALUE) */
  static hasDefault<T>(defaultValue: T): boolean {
    return defaultValue !== NO_DEFAULT_VALUE;
  }
}
