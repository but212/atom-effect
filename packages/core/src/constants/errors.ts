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
  COMPUTED_MUST_BE_FUNCTION: 'Computed target must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation pending with no default value',
  COMPUTED_COMPUTATION_FAILED: 'Computation execution failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computation execution failed',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected',
  COMPUTED_DISPOSED: 'Attempted to access disposed computed',

  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber must be a function or Subscriber object',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Subscriber execution failed',

  EFFECT_MUST_BE_FUNCTION: 'Effect target must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup failed',
  EFFECT_DISPOSED: 'Attempted to run disposed effect',

  SCHEDULER_FLUSH_OVERFLOW: (max: number, dropped: number): string =>
    `Maximum flush iterations (${max}) exceeded. ${dropped} jobs dropped. Possible infinite loop.`,

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

const toStr = (val: unknown, fallback = ''): string => {
  try {
    return val != null ? String(val) : fallback;
  } catch {
    return fallback;
  }
};

const toStrOrUndef = (val: unknown): string | undefined => {
  try {
    return val != null ? String(val) : undefined;
  } catch {
    return undefined;
  }
};

export const ERROR_STRATEGIES: readonly ErrorStrategy[] = [
  {
    /** Logic: Brand-based check for system errors */
    test: (e: unknown): boolean => {
      try {
        const tag = (e as Record<string, unknown>)?._tag;
        return typeof tag === 'string' && tag.endsWith('Error');
      } catch {
        return false;
      }
    },
    fetch: (e: unknown) => {
      const obj = e as Record<string, unknown>;
      return {
        name: toStr(obj.name),
        message: toStr(obj.message),
        recoverable: !!obj.recoverable,
        code: toStrOrUndef(obj.code),
      };
    },
  },
  {
    /** Logic: Fallback for standard JavaScript Errors */
    test: (e: unknown): e is Error => e instanceof Error,
    fetch: (e: unknown) => {
      const err = e as Error & Record<string, unknown>;
      return {
        name: err.name,
        message: err.message,
        recoverable: typeof err.recoverable === 'boolean' ? err.recoverable : true,
        code: toStrOrUndef(err.code),
      };
    },
  },
];
