/**
 * @fileoverview Error class hierarchy for reactive-atom library
 * @description Structured error classes with cause tracking and recoverability flags
 */

/**
 * Base error class for all reactive-atom errors
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

/**
 * Wraps an unknown error in the appropriate AtomError subclass
 *
 * Provides consistent error handling by:
 * - Preserving original error information in the cause field
 * - Adding contextual information about where the error occurred
 * - Returning existing AtomErrors unchanged
 * - Handling various error types (TypeError, ReferenceError, etc.)
 *
 * @param error - Unknown error to wrap
 * @param ErrorClass - AtomError subclass to use for wrapping
 * @param context - Context string describing where the error occurred
 * @returns Wrapped error with contextual information
 *
 * @example
 * ```ts
 * try {
 *   computeFn();
 * } catch (err) {
 *   throw wrapError(err, ComputedError, 'computation phase');
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  if (error instanceof TypeError) {
    return new ErrorClass(`Type error (${context}): ${error.message}`, error);
  }
  if (error instanceof ReferenceError) {
    return new ErrorClass(`Reference error (${context}): ${error.message}`, error);
  }
  if (error instanceof AtomError) {
    return error;
  }

  // Handle other error types
  const errorMessage = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : null;
  return new ErrorClass(`Unexpected error (${context}): ${errorMessage}`, cause);
}

/**
 * Type guard to check if a value is a Promise
 *
 * Uses duck-typing to detect Promise-like objects by checking for
 * the presence of a `then` method.
 *
 * @template T - The type the Promise resolves to
 * @param value - Value to check
 * @returns True if value has a `then` method (is Promise-like)
 *
 * @example
 * ```ts
 * const result = computeFn();
 * if (isPromise(result)) {
 *   await result;
 * }
 * ```
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
