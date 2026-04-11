/**
 * Structured JSON representation of an AtomError.
 */
export interface AtomErrorJSON {
  name: string;
  message: string;
  code?: string | undefined;
  recoverable: boolean;
  stack?: string | undefined;
  cause?: unknown | undefined;
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
 * Base error class for the Atom system.
 * Designed for high performance, traceability, and cycle protection.
 */
export class AtomError extends Error {
  override readonly name: string = 'AtomError';

  constructor(
    message: string,
    public readonly cause: unknown = null,
    public readonly recoverable: boolean = true,
    public readonly code?: string
  ) {
    super(message);

    // Maintain a stable object shape for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns the entire error chain as an array.
   * Includes the circular node if a cycle is detected.
   */
  getChain(): Array<AtomError | Error | unknown> {
    // Fast path: no cause
    if (this.cause === null || this.cause === undefined) {
      return [this];
    }

    const chain: Array<AtomError | Error | unknown> = [this];
    const seen = new Set<unknown>([this]);
    let current: unknown = this.cause;

    while (current !== null && current !== undefined) {
      const alreadySeen = seen.has(current);
      chain.push(current);

      if (alreadySeen) break;
      seen.add(current);

      if (current instanceof AtomError) {
        current = current.cause;
      } else if (current instanceof Error && 'cause' in current) {
        current = (current as Error & { cause?: unknown }).cause;
      } else {
        break;
      }
    }
    return chain;
  }

  /**
   * Serializes the error to a structured object for logging.
   * Protected against circular references.
   */
  toJSON(seen: Set<unknown> = new Set()): AtomErrorJSON {
    if (seen.has(this)) {
      return {
        name: this.name,
        message: '[Circular Reference]',
        recoverable: this.recoverable,
        code: this.code,
      };
    }
    seen.add(this);

    let causeJson: unknown = this.cause;
    if (this.cause instanceof AtomError) {
      causeJson = this.cause.toJSON(seen);
    } else if (this.cause instanceof Error) {
      causeJson = {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
        cause: (this.cause as Error & { cause?: unknown }).cause,
      };
    }

    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      stack: this.stack,
      cause: causeJson,
    };
  }

  /**
   * Internal helper to format wrapped messages consistently.
   */
  static format(source: string, context: string, message: string): string {
    return `${source} (${context}): ${message}`;
  }
}

/** Thrown when a computation fails. */
export class ComputedError extends AtomError {
  override readonly name = 'ComputedError';
}

/** Thrown when an effect execution or cleanup fails. */
export class EffectError extends AtomError {
  override readonly name = 'EffectError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/** Thrown by the execution engine or scheduler. */
export class SchedulerError extends AtomError {
  override readonly name = 'SchedulerError';
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
 * Wraps any value into the Atom error hierarchy, preserving the trace and context.
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
      AtomError.format(error.name, context, error.message),
      error,
      error.recoverable,
      error.code
    );
  }

  // 2. Native Error
  if (error instanceof Error) {
    const type = error.name || error.constructor.name || 'Error';
    return new ErrorClass(AtomError.format(type, context, error.message), error);
  }

  // 3. Unknown Types (Raw Preservation)
  return new ErrorClass(AtomError.format('Unexpected error', context, String(error)), error);
}
