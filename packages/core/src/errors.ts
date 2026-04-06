/**
 * Base error class.
 */
export class AtomError extends Error {
  override name = 'AtomError';

  constructor(
    message: string,
    public cause: Error | null = null,
    public recoverable = true
  ) {
    super(message);
  }
}

/** Computed error. */
export class ComputedError extends AtomError {
  override name = 'ComputedError';

  constructor(message: string, cause: Error | null = null) {
    super(message, cause, true);
  }
}

/** Effect error. */
export class EffectError extends AtomError {
  override name = 'EffectError';

  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
  }
}

/** Scheduler error. */
export class SchedulerError extends AtomError {
  override name = 'SchedulerError';

  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
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
} as const;

/**
 * Wraps error.
 *
 * @param error - Raw error.
 * @param ErrorClass - Error class.
 * @param context - Error context.
 */
export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  // 1. Skip if already wrapped
  if (error instanceof AtomError) {
    return error;
  }

  // 2. Handle native Error instances
  if (error instanceof Error) {
    const type = error.name || error.constructor.name || 'Error';
    return new ErrorClass(`${type} (${context}): ${error.message}`, error);
  }

  // 3. Handle unexpected types (string, number, etc.)
  return new ErrorClass(`Unexpected error (${context}): ${String(error)}`);
}
