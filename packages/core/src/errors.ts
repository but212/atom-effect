/**
 * Internal interface for AtomError constructor signature.
 * Used for type-safe instantiation in wrapError.
 */
interface AtomErrorClass<T extends AtomError> {
  new (message: string, cause?: unknown): T;
}

/**
 * Base error class for all atom-effect related issues.
 */
export class AtomError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown = null,
    public readonly recoverable: boolean = true
  ) {
    super(message);

    // Standardize error name. Explicitly set to support minified environments.
    this.name = 'AtomError';

    // Restore prototype chain.
    // Falls back to constructor.prototype if new.target is missing (ES5 transpilation).
    const proto = (new.target ? new.target.prototype : (this.constructor as any).prototype) as object;
    Object.setPrototypeOf(this, proto);

    // Capture clean stack trace on V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown during computed atom evaluation.
 */
export class ComputedError extends AtomError {
  constructor(message: string, cause: unknown = null) {
    super(message, cause, true);
    this.name = 'ComputedError';
  }
}

/**
 * Error thrown during effect execution or cleanup.
 */
export class EffectError extends AtomError {
  constructor(message: string, cause: unknown = null) {
    super(message, cause, false);
    this.name = 'EffectError';
  }
}

/**
 * Error related to scheduler internal state or limits.
 */
export class SchedulerError extends AtomError {
  constructor(message: string, cause: unknown = null) {
    super(message, cause, false);
    this.name = 'SchedulerError';
  }
}

/**
 * Error message registry.
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

  // Effect frequency
  EFFECT_FREQUENCY_LIMIT_EXCEEDED:
    'Effect executed too frequently within 1 second. Suspected infinite loop.',

  SCHEDULER_CALLBACK_MUST_BE_FUNCTION: 'Scheduler callback must be a function',
  SCHEDULER_END_BATCH_WITHOUT_START: 'endBatch() called without matching startBatch(). Ignoring.',
  BATCH_CALLBACK_MUST_BE_FUNCTION: 'Batch callback must be a function',

  // Tracking Errors
  TRACKING_UNTRACKED_ASYNC:
    'untracked() does not support async functions as tracking context is synchronous. Use peek() for non-reactive reads in async code.',
} as const;

/**
 * Wraps an unknown error into a specific AtomError subclass while preserving context.
 *
 * @template T - The specific AtomError subclass type (constructor).
 * @param error - The original error to wrap.
 * @param ErrorConstructor - The class to instantiate (e.g., ComputedError).
 * @param context - Human-readable description of where the error occurred.
 * @returns An instance of ErrorConstructor wrapping the original error.
 */
export function wrapError<T extends typeof AtomError>(
  error: unknown,
  ErrorConstructor: T,
  context: string
): InstanceType<T> {
  const isNative = error instanceof Error;
  const errorName = isNative ? error.name || error.constructor.name : 'Error';
  const innerMessage = isNative ? error.message : String(error);

  const finalMessage = isNative
    ? `${errorName} (${context}): ${innerMessage}`
    : `Unexpected error (${context}): ${innerMessage}`;

  // Cast through unknown to AtomErrorClass for type-safe construction without 'any'
  const Ctor = ErrorConstructor as unknown as AtomErrorClass<InstanceType<T>>;
  return new Ctor(finalMessage, error);
}
