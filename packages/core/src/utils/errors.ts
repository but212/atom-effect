/**
 * A structured JSON representation of an `AtomError` for cross-context transport.
 */
export interface AtomErrorJSON {
  /** The specific name of the error class. */
  name: string;
  /** The human-readable error message. */
  message: string;
  /** Machine-readable error identifier. */
  code?: string | undefined;
  /** When true, the reactive engine may attempt re-execution. */
  recoverable: boolean;
  /** Trace information. */
  stack?: string | undefined;
  /** The underlying cause resolved into a plain object or primitive. */
  cause?: unknown | undefined;
}

/**
 * Constructor signature for system-branded error classes.
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
 * Logic: Execution Context Traceability
 * Maintains a causal chain (`cause`) to allow developers to trace errors
 * through multiple layers of atoms, computed nodes, and effects.
 *
 * When to use:
 * - To define custom error categories within the engine.
 * - To wrap third-party errors with system-specific metadata.
 *
 * @example
 * ```typescript
 * import { AtomError } from '@but212/atom-effect';
 *
 * throw new AtomError(
 *   'Validation failed',
 *   rawInput,
 *   true,
 *   'ERR_VAL_001'
 * );
 * ```
 */
export class AtomError extends Error {
  override readonly name: string = 'AtomError';

  constructor(
    message: string,
    /** The raw value or error that triggered this instance. */
    public readonly cause: unknown = null,
    /**
     * Logic: Error Recovery
     * When true, indicate that the state might be corrected by a subsequent
     * update. When false, the node is considered permanently failed.
     */
    public readonly recoverable: boolean = true,
    /** Unique category identifier for programmatic handling. */
    public readonly code?: string
  ) {
    super(message);

    /**
     * Optimization: V8 Fast Path
     * Captures stack traces while maintaining a stable hidden class shape
     * for high-performance error object creation.
     */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Retrieves the full sequence of causal errors.
   *
   * Logic: Trace Reconstruction
   * Recursively traverses the `.cause` property while protecting against
   * infinite loops caused by circular error chains.
   *
   * @returns Sequential array of errors, starting from the current instance.
   */
  getChain(): Array<AtomError | Error | unknown> {
    const chain: Array<AtomError | Error | unknown> = [];
    const seen = new Set<unknown>();
    let current: unknown = this;

    while (current != null && !seen.has(current)) {
      chain.push(current);
      seen.add(current);
      current = (current as { cause?: unknown })?.cause;
    }
    return chain;
  }

  /**
   * Logic: Safe Serialization
   * Converts the error into a plain JSON object.
   * Automatically replaces circular references with a sentinel message to
   * prevent serialization crashes in loggers.
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

    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      stack: this.stack,
      cause: serializeErrorValue(this.cause, seen),
    };
  }

  /**
   * Formatting utility for internal diagnostic messages.
   * @internal
   */
  static format(source: string, context: string, message: string): string {
    return `${source} (${context}): ${message}`;
  }
}

/**
 * Thrown during the evaluation phase of a computed atom.
 */
export class ComputedError extends AtomError {
  override readonly name = 'ComputedError';
}

/**
 * Thrown during the execution or cleanup phase of a reactive effect.
 * Typically represents a side-effect failure.
 */
export class EffectError extends AtomError {
  override readonly name = 'EffectError';

  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Thrown by the internal engine when scheduling or flush limits are violated.
 */
export class SchedulerError extends AtomError {
  override readonly name = 'SchedulerError';

  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Central registry of standardized error messages.
 *
 * When to use:
 * - To ensure consistent diagnostic output.
 * - To identify specific failure conditions during unit testing.
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
  /** Returns a formatted message for flush overflow limits. */
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

/**
 * Normalizes an unknown error into the system's error hierarchy.
 *
 * When to use:
 * - In `catch` blocks within the engine to ensure cross-module traceability.
 * - To wrap user-provided callbacks with appropriate context (e.g., 'Effect Phase').
 *
 * @param error - The raw error value to wrap.
 * @param ErrorClass - The targeted `AtomError` subclass.
 * @param context - Label describing the origin of the failure.
 *
 * @example
 * ```typescript
 * try {
 *   fn();
 * } catch (err) {
 *   throw wrapError(err, EffectError, 'Effect Execution');
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  ErrorClass: AtomErrorConstructor,
  context: string
): AtomError {
  const meta = getErrorMetadata(error);

  return new ErrorClass(
    AtomError.format(meta.name, context, meta.message),
    error,
    meta.recoverable,
    meta.code
  );
}

/**
 * Logic: Heuristic Metadata Extraction
 * Resolves standard properties from `AtomError`, `Error`, or raw values.
 * @internal
 */
function getErrorMetadata(error: unknown) {
  if (error instanceof AtomError) {
    return {
      name: error.name,
      message: error.message,
      recoverable: error.recoverable,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      recoverable: true,
      code: (error as unknown as Record<string, unknown>)?.code as string | undefined,
    };
  }

  return {
    name: 'Unexpected error',
    message: String(error),
    recoverable: true,
    code: undefined,
  };
}

/**
 * Logic: Circular Serialization
 * Recursively serializes the error cause tree into a plain object structure.
 * @internal
 */
function serializeErrorValue(value: unknown, seen: Set<unknown>): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular Reference]';

  if (value instanceof AtomError) return value.toJSON(seen);

  if (value instanceof Error) {
    seen.add(value);
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serializeErrorValue((value as { cause?: unknown }).cause, seen),
    };
  }
  return value;
}
