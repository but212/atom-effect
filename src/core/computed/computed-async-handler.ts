import type { AtomError } from '../../errors/errors';
import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { ComputedStateFlags } from './computed-state-flags';

/** Manages Promise IDs to prevent race conditions in async computed */
export class PromiseIdManager {
  private lastPromiseId = 0;
  private readonly MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

  /** Generates next unique ID with overflow protection */
  next(): number {
    if (this.lastPromiseId >= this.MAX_PROMISE_ID) {
      this.lastPromiseId = 0;
    }
    return ++this.lastPromiseId;
  }

  current(): number {
    return this.lastPromiseId;
  }

  /** Checks if ID is still current (not superseded) */
  isValid(id: number): boolean {
    return id === this.lastPromiseId;
  }

  invalidate(): void {
    this.next();
  }
}

/** Handles async computation lifecycle with race condition prevention */
export class AsyncComputationHandler<T> {
  constructor(
    private stateFlags: ComputedStateFlags,
    private promiseIdManager: PromiseIdManager,
    private equal: (a: T, b: T) => boolean,
    private onError: ((error: Error) => void) | null,
    private notifySubscribers: () => void
  ) {}

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
