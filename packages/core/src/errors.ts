/**
 * Structured JSON representation of an AtomError for external transport or logging.
 *
 * @public
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
 * Constructor type signature for Atom-branded errors.
 *
 * @internal
 */
export type AtomErrorConstructor = new (
  message: string,
  cause?: unknown,
  recoverable?: boolean,
  code?: string
) => AtomError;

/**
 * Base error class for the Atom system.
 *
 * Logic: Provides high-performance traceability by maintaining an error chain
 * and protecting against circular references during serialization.
 *
 * When to use:
 * - Creating custom error types within the reactive engine.
 * - Inspecting or logging complex failure chains.
 *
 * @example
 * ```typescript
 * try {
 *   performComputation();
 * } catch (err) {
 *   throw new AtomError('Computation failed', err, true, 'ERR_COMP_01');
 * }
 * ```
 *
 * @public
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

    // Optimization: Maintain a stable object shape for V8 to ensure
    // errors remain in the "fast" object optimization path.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns the entire error chain as an array.
   *
   * @returns Array containing historical causes.
   */
  getChain(): Array<AtomError | Error | unknown> {
    const cause = this.cause;
    if (cause === null || cause === undefined) return [this];

    const chain: Array<AtomError | Error | unknown> = [this];
    let current: unknown = cause;
    let seen: Set<unknown> | null = null;

    while (current !== null && current !== undefined) {
      chain.push(current);

      if (current === this || seen?.has(current)) break;

      if (current instanceof AtomError) {
        current = current.cause;
      } else if (current instanceof Error) {
        current = (current as { cause?: unknown }).cause;
      } else {
        break;
      }

      // Optimization: Initialize deep cycle detection only for long chains (>3)
      // to minimize memory allocations for simple one-off errors.
      if (chain.length > 3) {
        if (seen === null) {
          seen = new Set(chain);
        } else {
          seen.add(current);
        }
      }
    }
    return chain;
  }

  /**
   * Serializes the error to a structured object for external logging/storage.
   *
   * Caution: Heavily recursive for deep chains.
   * Constraint: Must prevent circular references to avoid crashing serializers (e.g., JSON.stringify).
   *
   * @param seen - Internal tracking set to manage recursion.
   */
  toJSON(seen?: Set<unknown>): AtomErrorJSON {
    const s = seen ?? new Set<unknown>();
    if (s.has(this)) {
      return {
        name: this.name,
        message: '[Circular Reference]',
        recoverable: this.recoverable,
        code: this.code,
      };
    }
    s.add(this);

    let causeJson: unknown = this.cause;
    if (causeJson instanceof AtomError) {
      causeJson = causeJson.toJSON(s);
    } else if (causeJson instanceof Error) {
      causeJson = {
        name: causeJson.name,
        message: causeJson.message,
        stack: causeJson.stack,
        cause: (causeJson as { cause?: unknown }).cause,
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

  static format(source: string, context: string, message: string): string {
    return `${source} (${context}): ${message}`;
  }
}

/**
 * Thrown when a computation fails (e.g., in a selector or computed atom).
 * @public
 */
export class ComputedError extends AtomError {
  override readonly name = 'ComputedError';
}

/**
 * Thrown when an effect execution or cleanup fails.
 * @public
 */
export class EffectError extends AtomError {
  override readonly name = 'EffectError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Thrown by the execution engine or internal scheduler.
 * @public
 */
export class SchedulerError extends AtomError {
  override readonly name = 'SchedulerError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Registry of standardized error messages for the entire system.
 *
 * When to use:
 * - Providing consistent localized strings for error logging.
 * - Comparing error messages in tests or diagnostic tools.
 *
 * @public
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
 * Wraps any caught value into the Atom error hierarchy, preserving the trace context.
 *
 * When to use:
 * - Normalizing `catch (err)` blocks before rethrowing or logging.
 * - Ensuring consistency across nested execution scopes.
 *
 * @param error - The raw error or object thrown.
 * @param ErrorClass - The specific AtomError subclass to use as container.
 * @param context - Human-readable description of the origin context.
 *
 * @example
 * ```typescript
 * wrapError(rawError, ComputedError, 'Computed compute() block');
 * ```
 *
 * @public
 */
export function wrapError(
  error: unknown,
  ErrorClass: AtomErrorConstructor,
  context: string
): AtomError {
  if (error instanceof AtomError) {
    return new ErrorClass(
      `${error.name} (${context}): ${error.message}`,
      error,
      error.recoverable,
      error.code
    );
  }

  if (error instanceof Error) {
    return new ErrorClass(`${error.name || 'Error'} (${context}): ${error.message}`, error);
  }

  return new ErrorClass(`Unexpected error (${context}): ${String(error)}`, error);
}
