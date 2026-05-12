/**
 * @module ErrorMessages
 *
 * Responsibility:
 * Provides a centralized registry of standardized error messages for the engine.
 */

/**
 * Role: Centralized registry of standardized error messages for the engine.
 */
export const ERROR_MESSAGES = {
  // --- Computed Phase ---
  COMPUTED_MUST_BE_FUNCTION: 'Computed target must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation pending with no default value',
  COMPUTED_COMPUTATION_FAILED: 'Computation execution failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computation execution failed',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected',
  COMPUTED_DISPOSED: 'Attempted to access disposed computed',

  // --- Atom Phase ---
  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber must be a function or Subscriber object',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Subscriber execution failed',

  // --- Effect Phase ---
  EFFECT_MUST_BE_FUNCTION: 'Effect target must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup failed',
  EFFECT_DISPOSED: 'Attempted to run disposed effect',

  // --- Engine/Scheduler Phase ---
  SCHEDULER_FLUSH_OVERFLOW: (max: number, dropped: number): string =>
    `Maximum flush iterations (${max}) exceeded. ${dropped} jobs dropped. Possible infinite loop.`,

  // --- System Diagnostics ---
  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Exception encountered in onError handler',
  /** Logic: Loop Protection */
  EFFECT_FREQUENCY_LIMIT_EXCEEDED:
    'Effect executed too frequently within 1 second. Suspected infinite loop.',
  SCHEDULER_CALLBACK_MUST_BE_FUNCTION: 'Scheduler callback must be a function',
  SCHEDULER_END_BATCH_WITHOUT_START: 'endBatch() called without matching startBatch(). Ignoring.',
  BATCH_CALLBACK_MUST_BE_FUNCTION: 'Batch callback must be a function',
} as const satisfies Record<string, string | ((...args: number[]) => string)>;

/** @internal */
export type ErrorStrategy = {
  test: (e: unknown) => boolean;
  fetch: (e: unknown) => {
    name: string;
    message: string;
    recoverable: boolean;
    code: string | undefined;
  };
};

/**
 * Data-driven strategies for extracting metadata from different error types.
 * @internal
 */
export const ERROR_STRATEGIES: readonly ErrorStrategy[] = [
  {
    /** Logic: Brand-based check for system errors */
    test: (e: unknown): boolean =>
      typeof e === 'object' && e !== null && '_tag' in e && String(e._tag).endsWith('Error'),
    fetch: (e: unknown) => ({
      name: String((e as Record<string, unknown>).name),
      message: String((e as Record<string, unknown>).message),
      recoverable: Boolean((e as Record<string, unknown>).recoverable),
      code: (e as Record<string, unknown>).code as string | undefined,
    }),
  },
  {
    /** Logic: Fallback for standard JavaScript Errors */
    test: (e: unknown): e is Error => e instanceof Error,
    fetch: (e: unknown) => ({
      name: (e as Error).name,
      message: (e as Error).message,
      recoverable: true,
      code: (e as Record<string, unknown>).code as string | undefined,
    }),
  },
];
