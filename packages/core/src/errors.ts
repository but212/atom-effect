/**
 * A structured JSON representation of an `AtomError` used for transport or logging.
 */
export interface AtomErrorJSON {
  /** The specific name of the error class. */
  name: string;
  /** The human-readable error message. */
  message: string;
  /** An optional machine-readable error code. */
  code?: string | undefined;
  /** Indicates whether the system can attempt to recover from this error. */
  recoverable: boolean;
  /** The stack trace associated with the error. */
  stack?: string | undefined;
  /** The underlying cause of the error, if any. */
  cause?: unknown | undefined;
}

/**
 * A constructor signature for Atom-branded error classes.
 * @internal
 */
export type AtomErrorConstructor = new (
  message: string,
  cause?: unknown,
  recoverable?: boolean,
  code?: string
) => AtomError;

/**
 * The base error class for the reactive system.
 *
 * This class provides advanced traceability by maintaining an execution-context
 * error chain and implements protection against circular references during
 * serialization to JSON.
 *
 * When to use:
 * - To define custom error types within reactive primitives.
 * - To capture and wrap third-party errors with system-specific context.
 *
 * @example
 * ```typescript
 * import { AtomError } from '@but212/atom-effect';
 *
 * try {
 *   executeTask();
 * } catch (err) {
 *   throw new AtomError('Task failed', err, true, 'ERR_TASK_FAILED');
 * }
 * ```
 */
export class AtomError extends Error {
  override readonly name: string = 'AtomError';

  constructor(
    message: string,
    /** The underlying value or error that caused this error to be thrown. */
    public readonly cause: unknown = null,
    /** Indicates whether the reactive node should attempt to re-execute after this error. */
    public readonly recoverable: boolean = true,
    /** A unique identifier for the specific error category. */
    public readonly code?: string
  ) {
    super(message);

    // Optimization: Capture the stack trace while maintaining a stable object shape.
    // This ensures that error objects stay in V8's fast optimization path.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Retrieves the full sequence of causal errors associated with this instance.
   *
   * @returns An array containing the current error followed by its historical causes.
   */
  getChain(): Array<AtomError | Error | unknown> {
    const cause = this.cause;
    if (cause === null || cause === undefined) return [this];

    const chain: Array<AtomError | Error | unknown> = [this];
    let current: unknown = cause;
    let seen: Set<unknown> | null = null;

    while (current !== null && current !== undefined) {
      chain.push(current);

      // Constraint: Prevent infinite loops during chain traversal due to recursive error wrapping.
      if (current === this || seen?.has(current)) break;

      if (current instanceof AtomError) {
        current = current.cause;
      } else if (current instanceof Error) {
        current = (current as { cause?: unknown }).cause;
      } else {
        break;
      }

      // Optimization: Cycle detection is lazily initialized for deep chains (>3) to avoid
      // unnecessary Set allocations for standard shallow errors.
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
   * Serializes the error instance into a plain object structure.
   *
   * Caution: This method is recursive and may impact performance for extremely deep error chains.
   * Constraint: It incorporates cycle detection to prevent circular reference errors
   * during serialization (e.g., when using `JSON.stringify`).
   *
   * @param seen - An internal set used to track visited objects during recursion.
   * @returns A JSON-serializable representation of the error.
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

  /** @internal */
  static format(source: string, context: string, message: string): string {
    return `${source} (${context}): ${message}`;
  }
}

/**
 * An error thrown during the evaluation of a computed atom or selector.
 */
export class ComputedError extends AtomError {
  override readonly name = 'ComputedError';
}

/**
 * An error thrown during the execution or cleanup phase of a reactive effect.
 */
export class EffectError extends AtomError {
  override readonly name = 'EffectError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * An error thrown by the internal scheduler or execution engine.
 */
export class SchedulerError extends AtomError {
  override readonly name = 'SchedulerError';
  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * A central registry of standardized error messages used across the core library.
 *
 * When to use:
 * - To provide consistent diagnostic output in loggers or dev-tools.
 * - To programmatically identify specific error conditions in tests.
 */
export const ERROR_MESSAGES = {
  // --- Computed Errors ---
  COMPUTED_MUST_BE_FUNCTION: 'Computed target must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation pending with no default value',
  COMPUTED_COMPUTATION_FAILED: 'Computation execution failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computation execution failed',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected',
  COMPUTED_DISPOSED: 'Attempted to access disposed computed',

  // --- Atom Errors ---
  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber must be a function or Subscriber object',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Subscriber execution failed',

  // --- Effect Errors ---
  EFFECT_MUST_BE_FUNCTION: 'Effect target must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup failed',
  EFFECT_DISPOSED: 'Attempted to run disposed effect',

  // --- Scheduler Errors ---
  /** Returns a formatted message for flush overflow errors. */
  SCHEDULER_FLUSH_OVERFLOW: (max: number, dropped: number): string =>
    `Maximum flush iterations (${max}) exceeded. ${dropped} jobs dropped. Possible infinite loop.`,

  // --- System & Debug ---
  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Exception encountered in onError handler',
  EFFECT_FREQUENCY_LIMIT_EXCEEDED:
    'Effect executed too frequently within 1 second. Suspected infinite loop.',
  SCHEDULER_CALLBACK_MUST_BE_FUNCTION: 'Scheduler callback must be a function',
  SCHEDULER_END_BATCH_WITHOUT_START: 'endBatch() called without matching startBatch(). Ignoring.',
  BATCH_CALLBACK_MUST_BE_FUNCTION: 'Batch callback must be a function',
} as const;

/**
 * Normalizes an unknown error value into the system's error hierarchy.
 *
 * When to use:
 * - In `catch` blocks to ensure that errors propagated from effects or atoms
 *   carry consistent technical context and are traceable through the chain.
 *
 * @param error - The raw error value or object to wrap.
 * @param ErrorClass - The specific `AtomError` subclass used as a container.
 * @param context - A human-readable label indicating the origin of the error.
 * @returns A new instance of `ErrorClass` containing the original error as a cause.
 *
 * @example
 * ```typescript
 * import { wrapError, EffectError } from '@but212/atom-effect';
 *
 * try {
 *   userCallback();
 * } catch (err) {
 *   throw wrapError(err, EffectError, 'User Callback Phase');
 * }
 * ```
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
