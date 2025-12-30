/**
 * @fileoverview Async computation handler for computed atoms
 * @description Handles Promise-based asynchronous computations with race condition prevention
 */

import type { AtomError } from '../../errors/errors';
import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { ComputedStateFlags } from './computed-state-flags';

/**
 * Promise ID manager to prevent race conditions in async computed
 */
export class PromiseIdManager {
  private lastPromiseId = 0;
  private readonly MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

  /**
   * Generates next Promise ID with overflow protection
   * @returns New Promise ID
   */
  next(): number {
    // Prevent Promise ID overflow (wrap around at MAX_SAFE_INTEGER)
    if (this.lastPromiseId >= this.MAX_PROMISE_ID) {
      this.lastPromiseId = 0;
    }
    return ++this.lastPromiseId;
  }

  /**
   * Gets current Promise ID
   * @returns Current Promise ID
   */
  current(): number {
    return this.lastPromiseId;
  }

  /**
   * Checks if Promise ID is still valid (not superseded by newer computation)
   * @param id Promise ID to check
   * @returns true if ID is current
   */
  isValid(id: number): boolean {
    return id === this.lastPromiseId;
  }

  /**
   * Increments Promise ID to invalidate previous computations
   */
  invalidate(): void {
    this.next();
  }
}

/**
 * Async computation handler
 * Manages Promise resolution/rejection with state updates and notifications
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
   * Handles async computation Promise
   * @param result Promise to handle
   * @param getValue Getter for current value
   * @param setValue Setter for new value
   * @param setError Setter for error
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
   * Handles successful Promise resolution
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
   * Handles Promise rejection
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
