/**
 * Base error class for the Atom system.
 * Designed for high traceability and programmatic inspection.
 */
export class AtomError extends Error {
  // Explicitly set name on the prototype for better performance and reliability
  override name = 'AtomError';

  constructor(
    message: string,
    public readonly cause: unknown = null,
    public readonly recoverable = true,
    public readonly code?: string
  ) {
    super(message);
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns the entire error chain as an array.
   * Useful for deep debugging and logging.
   */
  getChain(): Array<AtomError | Error | unknown> {
    const chain: Array<AtomError | Error | unknown> = [this];
    let current: unknown = this.cause;
    while (current) {
      chain.push(current);
      if (current instanceof AtomError) {
        current = current.cause;
      } else if (current instanceof Error && 'cause' in current) {
        current = (current as Error & { cause?: unknown }).cause;
      } else {
        current = null;
      }
    }
    return chain;
  }

  /**
   * Custom serialization for logging systems.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      stack: this.stack,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message }
          : this.cause,
    };
  }
}

/** Computed-specific error. */
export class ComputedError extends AtomError {
  override name = 'ComputedError';
  constructor(message: string, cause: unknown = null, recoverable = true, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/** Effect-specific error. */
export class EffectError extends AtomError {
  override name = 'EffectError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/** Scheduler-specific error. */
export class SchedulerError extends AtomError {
  override name = 'SchedulerError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Registry of standardized error messages.
 */
export const ERROR_MESSAGES = {
  // Computed Errors
  COMPUTED_MUST_BE_FUNCTION: 'Computed target must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation pending with no default value',
  COMPUTED_COMPUTATION_FAILED: 'Computation execution failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computation execution failed',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected',
  COMPUTED_DISPOSED: 'Attempted to access disposed computed',

  // Atom Errors
  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber must be a function or Subscriber object',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Subscriber execution failed',

  // Effect Errors
  EFFECT_MUST_BE_FUNCTION: 'Effect target must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup failed',
  EFFECT_DISPOSED: 'Attempted to run disposed effect',

  // Scheduler Errors
  SCHEDULER_FLUSH_OVERFLOW: (max: number, dropped: number): string =>
    `Maximum flush iterations (${max}) exceeded. ${dropped} jobs dropped. Possible infinite loop.`,

  // System / Debug
  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Exception encountered in onError handler',
  EFFECT_FREQUENCY_LIMIT_EXCEEDED:
    'Effect executed too frequently within 1 second. Suspected infinite loop.',
  SCHEDULER_CALLBACK_MUST_BE_FUNCTION: 'Scheduler callback must be a function',
  SCHEDULER_END_BATCH_WITHOUT_START: 'endBatch() called without matching startBatch(). Ignoring.',
  BATCH_CALLBACK_MUST_BE_FUNCTION: 'Batch callback must be a function',
} as const;

/**
 * Internal helper to format error messages consistently.
 */
function formatWrappedMessage(source: string, context: string, originalMessage: string): string {
  return `${source} (${context}): ${originalMessage}`;
}

/**
 * Constructor type for Atom errors.
 */
export type AtomErrorConstructor = new (
  message: string,
  cause?: unknown,
  recoverable?: boolean,
  code?: string
) => AtomError;

/**
 * Wraps any error into the Atom error hierarchy, preserving the trace and context.
 *
 * @param error - The raw error or object thrown.
 * @param ErrorClass - The specific AtomError subclass to use.
 * @param context - Human-readable description of where the error occurred.
 */
export function wrapError(
  error: unknown,
  ErrorClass: AtomErrorConstructor,
  context: string
): AtomError {
  // 1. AtomError (Chainable Trace)
  if (error instanceof AtomError) {
    return new ErrorClass(
      formatWrappedMessage(error.name, context, error.message),
      error,
      error.recoverable,
      error.code
    );
  }

  // 2. Native Error
  if (error instanceof Error) {
    const type = error.name || error.constructor.name || 'Error';
    return new ErrorClass(formatWrappedMessage(type, context, error.message), error);
  }

  // 3. Unknown Types (Raw Preservation)
  return new ErrorClass(formatWrappedMessage('Unexpected error', context, String(error)), error);
}
