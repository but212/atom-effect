/**
 * @module Errors
 *
 * Responsibility:
 * Defines the unified error hierarchy and normalization utilities for the
 * reactive engine. Orchestrates causal chain tracking and safe serialization.
 *
 * Design Intent:
 * Provides a structured way to trace failures across asynchronous boundaries
 * while ensuring that errors remain serializable for cross-context logging
 * and persistent diagnostics.
 */

import { ERROR_STRATEGIES } from '@/constants';
import type { AtomErrorConstructor, AtomErrorJSON, AtomErrorOptions } from '@/types';

/**
 * Role: Base Reactive Error
 * The foundational error class for the reactive system, supporting causal chains
 * and serializable metadata.
 *
 * When to use:
 * - To define custom error categories within the engine.
 * - To wrap third-party errors with system-specific reactive metadata.
 *
 * @example
 * ```typescript
 * import { AtomError } from '@but212/atom-effect';
 *
 * throw new AtomError('Operation failed', {
 *   cause: new Error('Network timeout'),
 *   recoverable: true,
 *   code: 'ERR_NET_001'
 * });
 * ```
 */
export class AtomError extends Error {
  /**
   * Logic: Brand-Based Identification
   * Enables plain-object identity checks without relying on `instanceof`,
   * which often fails across context boundaries (e.g., Worker threads).
   */
  readonly _tag: string = 'AtomError';
  override readonly name: string = 'AtomError';

  public readonly cause: unknown;
  public readonly recoverable: boolean;
  public readonly code?: string | undefined;

  constructor(message: string, options: AtomErrorOptions = {}) {
    /**
     * Why: ES2022 Options Passing
     * Automatically sets the standard `.cause` property on the Error instance
     * for native platform compatibility.
     */
    super(message, options);

    this.cause = options.cause ?? null;
    this.recoverable = options.recoverable ?? true;
    this.code = options.code;

    /**
     * Optimization: V8 Fast Path
     * Captures stack traces while maintaining a stable hidden class shape
     * to ensure high-performance object creation during high-frequency errors.
     */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * @deprecated since v0.33.0 — Use standalone `getErrorChain(error)` instead.
   * Will be removed in v0.34.0.
   * Migration: Replace `err.getChain()` with `getErrorChain(err)`.
   * @see getErrorChain
   */
  public getChain(): Array<unknown> {
    return getErrorChain(this);
  }

  /**
   * @deprecated since v0.33.0 — Use standalone `serializeError(error)` instead.
   * Will be removed in v0.34.0.
   * Migration: Replace `err.toJSON()` with `serializeError(err)`.
   * @see serializeError
   */
  public toJSON(): AtomErrorJSON {
    return serializeError(this) as AtomErrorJSON;
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
 * Role: Evaluation Failure
 * Specific error thrown during the evaluation phase of a computed atom.
 */
export class ComputedError extends AtomError {
  override readonly _tag = 'ComputedError';
  override readonly name = 'ComputedError';
}

/**
 * Role: Side-Effect Failure
 * Error thrown during the execution or cleanup phase of a reactive effect.
 * Defaults to non-recoverable status to prevent infinite retry loops.
 */
export class EffectError extends AtomError {
  override readonly _tag = 'EffectError';
  override readonly name = 'EffectError';

  constructor(message: string, options: AtomErrorOptions = {}) {
    super(message, { recoverable: false, ...options });
  }
}

/**
 * Role: System Level Failure
 * Engine error thrown when scheduling constraints or flush limits are violated.
 */
export class SchedulerError extends AtomError {
  override readonly _tag = 'SchedulerError';
  override readonly name = 'SchedulerError';

  constructor(message: string, options: AtomErrorOptions = {}) {
    super(message, { recoverable: false, ...options });
  }
}

/**
 * Logic: Trace Reconstruction
 * Recursively traverses the `.cause` property to reconstruct the error chain.
 *
 * Constraint: Circular Reference Protection
 * Uses a `Set` to track visited errors and prevent infinite loops during
 * chain traversal.
 *
 * @param error - The root error to trace.
 * @returns Sequential array of errors, starting from the input.
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
 * Logic: Safe Serialization
 * Converts any error or value into a plain JSON-serializable object.
 *
 * Caution: Circular Dependency Detection
 * Replaces circular references with a sentinel message (`[Circular Reference]`)
 * to prevent serialization crashes in logging or storage pipelines.
 *
 * @param error - The error or object to serialize.
 * @param seen - @internal Internal set for circular tracking.
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
 *
 * When to use:
 * - To catch and re-throw external exceptions (DOM, Fetch) with system metadata.
 * - To unify error reporting formats across different engine modules.
 *
 * @param error - The raw error to wrap.
 * @param ErrorClass - The system error class to instantiate.
 * @param context - Human-readable context (e.g., 'Computed: userId').
 * @returns A structured `AtomError` instance.
 */
export function wrapError(
  error: unknown,
  ErrorClass: AtomErrorConstructor,
  context: string
): AtomError {
  const meta = getErrorMetadata(error);

  return new ErrorClass(AtomError.format(meta.name, context, meta.message), {
    cause: error,
    recoverable: meta.recoverable,
    code: meta.code,
  });
}

/**
 * Logic: Heuristic Metadata Extraction
 * Iterates through configured strategies to extract meaningful data from
 * non-standard error objects or primitives.
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
