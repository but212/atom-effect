import type { AtomError } from '../../errors/errors';
import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { NO_DEFAULT_VALUE } from '../../utils/debug';
import type { ComputedStateFlags } from './computed-state-flags';

/** Handles sync computation results with value comparison */
export class SyncComputationHandler<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private equal: (a: T, b: T) => boolean,
    private notifySubscribers: () => void
  ) {}

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

/** Handles computation errors - always re-throws after state update */
export class ComputationErrorHandler {
  constructor(
    private stateFlags: ComputedStateFlags,
    private onError: ((error: Error) => void) | null
  ) {}

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

/** Provides state-specific value access handling */
export class StateValueHandlers<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private defaultValue: T,
    private hasDefaultValue: boolean
  ) {}

  handleRecomputing(currentValue: T): T {
    return currentValue;
  }

  handlePending(): T {
    if (this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
  }

  handleRejected(error: AtomError | null): T {
    if (error?.recoverable && this.hasDefaultValue) {
      return this.defaultValue;
    }
    throw error;
  }

  static hasDefault<T>(defaultValue: T): boolean {
    return defaultValue !== NO_DEFAULT_VALUE;
  }
}
