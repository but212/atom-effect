/**
 * Base error class for all atom-effect errors
 *
 * Provides enhanced error information including:
 * - Original cause tracking for error chains
 * - Recoverability flag for error handling strategies
 * - Timestamp for debugging and logging
 *
 * @example
 * ```ts
 * throw new AtomError('Invalid state', originalError, false);
 * ```
 */
export class AtomError extends Error {
  /** Original error that caused this error, if any */
  cause: Error | null;
  /** Whether this error can be recovered from */
  recoverable: boolean;
  /** When this error occurred */
  timestamp: Date;

  /**
   * Creates a new AtomError
   * @param message - Error message describing what went wrong
   * @param cause - Original error that caused this error
   * @param recoverable - Whether the operation can be retried
   */
  constructor(message: string, cause: Error | null = null, recoverable: boolean = true) {
    super(message);
    this.name = 'AtomError';
    this.cause = cause;
    this.recoverable = recoverable;
    this.timestamp = new Date();
  }
}

/**
 * Error thrown during computed value computation
 *
 * Computed errors are considered recoverable by default since they typically
 * result from transient data issues rather than programming errors.
 */
export class ComputedError extends AtomError {
  /**
   * Creates a new ComputedError
   * @param message - Error message
   * @param cause - Original error
   */
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, true);
    this.name = 'ComputedError';
  }
}

/**
 * Error thrown during effect execution
 *
 * Effect errors are considered non-recoverable by default since effects
 * typically represent critical side effects that shouldn't fail silently.
 */
export class EffectError extends AtomError {
  /**
   * Creates a new EffectError
   * @param message - Error message
   * @param cause - Original error
   */
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
    this.name = 'EffectError';
  }
}

/**
 * Error thrown by the scheduler system
 *
 * Scheduler errors indicate fundamental issues with the batching/scheduling
 * mechanism and are considered non-recoverable.
 */
export class SchedulerError extends AtomError {
  /**
   * Creates a new SchedulerError
   * @param message - Error message
   * @param cause - Original error
   */
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
    this.name = 'SchedulerError';
  }
}
