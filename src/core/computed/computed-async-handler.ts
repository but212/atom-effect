import type { AtomError } from '@/errors/errors';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { ComputedStateFlags } from './computed-state-flags';
import { wrapError } from '@/utils/error';

/**
 * Manages unique identifiers for Promises to prevent race conditions in asynchronous computations.
 * Each new computation increments the ID; results from superseded Promises are ignored.
 */
export class PromiseIdManager {
  private lastPromiseId = 0;
  private readonly MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

  /**
   * Generates the next unique ID.
   * Resets to 0 if the maximum safe integer is reached.
   */
  next(): number {
    if (this.lastPromiseId >= this.MAX_PROMISE_ID) {
      this.lastPromiseId = 0;
    }
    return ++this.lastPromiseId;
  }

  /** Returns the current (latest) Promise ID */
  current(): number {
    return this.lastPromiseId;
  }

  /**
   * Verifies if the given ID is still the most recent.
   * @param id - The Promise ID to check.
   */
  isValid(id: number): boolean {
    return id === this.lastPromiseId;
  }

  /** Forces invalidation of the current Promise by incrementing the ID */
  invalidate(): void {
    this.next();
  }
}

/**
 * Handles the lifecycle of asynchronous computations.
 * Manages transitions to PENDING, handles resolution/rejection, and prevents race conditions.
 */
export class AsyncComputationHandler<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private promiseIdManager: PromiseIdManager,
    private equal: (a: T, b: T) => boolean,
    private onError: ((error: Error) => void) | null,
    private notifySubscribers: () => void
  ) {}

  /**
   * Orchestrates the execution of an asynchronous computation.
   * @param result - The Promise returning the computed value.
   * @param getValue - Function to get the current stored value for comparison.
   * @param setValue - Function to update the stored value.
   * @param setError - Function to store computation errors.
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
        if (!this.promiseIdManager.isValid(promiseId)) return;
        this.handleResolution(resolvedValue, getValue, setValue, setError);
      })
      .catch((err) => {
        if (!this.promiseIdManager.isValid(promiseId)) return;
        this.handleRejection(err, setError);
      });
  }

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
