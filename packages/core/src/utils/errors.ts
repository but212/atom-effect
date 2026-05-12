/**
 * @module Errors
 *
 * Responsibility:
 * Defines the unified error hierarchy and normalization utilities for the
 * reactive engine. Orchestrates causal chain tracking and safe serialization.
 *
 * Design Intent:
 * Provides a structured way to trace failures across asynchronous boundaries
 * while ensuring that errors remain serializable for cross-context logging.
 */

import { ERROR_STRATEGIES } from '@/constants';
import type { AtomErrorConstructor, AtomErrorJSON } from '@/types';

/**
 * The base error class for the reactive system.
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
 *   { input: -1 },
 *   true,
 *   'ERR_VAL_001'
 * );
 * ```
 */
export class AtomError extends Error {
  /**
   * Logic: Brand-based Identification
   * Allows for plain-object checks and identification without relying
   * solely on `instanceof`, which can fail across context boundaries.
   */
  readonly _tag: string = 'AtomError';
  override readonly name: string = 'AtomError';

  constructor(
    message: string,
    /**
     * Logic: Causal Chain
     * The raw value or error that triggered this instance. Allows for
     * deep trace reconstruction across reactive nodes.
     */
    public readonly cause: unknown = null,
    /**
     * Logic: Error Recovery
     * When true, indicates the state may be corrected by a subsequent
     * update. When false, the node is marked as permanently failed.
     */
    public readonly recoverable: boolean = true,
    /** Unique category identifier for programmatic handling. */
    public readonly code?: string
  ) {
    super(message);

    /**
     * Optimization: V8 Fast Path
     * Captures stack traces while maintaining a stable hidden class shape
     * to ensure high-performance object creation in the engine core.
     */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Role: Formatting utility for standardized diagnostic messages.
   * @internal
   */
  static format(source: string, context: string, message: string): string {
    return `${source} (${context}): ${message}`;
  }
}

/**
 * Role: Specific error thrown during the evaluation phase of a computed atom.
 */
export class ComputedError extends AtomError {
  override readonly _tag = 'ComputedError';
  override readonly name = 'ComputedError';
}

/**
 * Role: Error thrown during the execution or cleanup phase of a reactive effect.
 */
export class EffectError extends AtomError {
  override readonly _tag = 'EffectError';
  override readonly name = 'EffectError';

  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Role: Engine error thrown when scheduling or flush limits are violated.
 */
export class SchedulerError extends AtomError {
  override readonly _tag = 'SchedulerError';
  override readonly name = 'SchedulerError';

  constructor(message: string, cause: unknown = null, recoverable = false, code?: string) {
    super(message, cause, recoverable, code);
  }
}

/**
 * Logic: Trace Reconstruction (Pure Function)
 * Recursively traverses the `.cause` property to reconstruct the error chain.
 *
 * Constraint: Implements circular reference protection via `Set` tracking.
 *
 * @returns Sequential array of errors, starting from the current instance.
 */
export function getErrorChain(error: unknown): Array<unknown> {
  const chain: Array<unknown> = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current != null && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = (current as { cause?: unknown })?.cause;
  }
  return chain;
}

/**
 * Logic: Safe Serialization (Pure Function)
 * Converts any error or value into a plain JSON-serializable object.
 *
 * Caution: Automatically replaces circular references with a sentinel
 * message to prevent serialization crashes.
 */
export function serializeError(
  error: unknown,
  seen: Set<unknown> = new Set()
): AtomErrorJSON | unknown {
  if (error == null || typeof error !== 'object') return error;
  if (seen.has(error)) {
    const errObj = error as Record<string, unknown>;
    return {
      name: typeof errObj.name === 'string' ? errObj.name : 'Object',
      message: '[Circular Reference]',
      recoverable: typeof errObj.recoverable === 'boolean' ? errObj.recoverable : true,
      code: typeof errObj.code === 'string' ? errObj.code : undefined,
    };
  }

  seen.add(error);

  if (error instanceof AtomError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      recoverable: error.recoverable,
      stack: error.stack,
      cause: serializeError(error.cause, seen),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeError((error as Error & { cause?: unknown }).cause, seen),
      recoverable: true,
    };
  }

  return error;
}

/**
 * Normalizes an unknown error into the system's error hierarchy.
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
 * @internal
 */
function getErrorMetadata(error: unknown) {
  for (const strategy of ERROR_STRATEGIES) {
    if (strategy.test(error)) {
      return strategy.fetch(error as never);
    }
  }

  return {
    name: 'Unexpected error',
    message: String(error),
    recoverable: true,
    code: undefined,
  };
}
