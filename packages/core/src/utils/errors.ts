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

import type { AtomErrorConstructor, AtomErrorJSON, AtomErrorOptions } from '@/types';
import { isError } from './type-guards';

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
  for (
    let currentError = error;
    currentError != null && !seen.has(currentError);
    currentError =
      currentError && typeof currentError === 'object' && 'cause' in currentError
        ? Reflect.get(currentError, 'cause')
        : undefined
  ) {
    chain.push(currentError);
    seen.add(currentError);
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
export function serializeError(error: Error, seen?: Set<unknown>): AtomErrorJSON;
export function serializeError(error: null | undefined, seen?: Set<unknown>): null | undefined;
export function serializeError(error: unknown, seen?: Set<unknown>): AtomErrorJSON | unknown;
export function serializeError(
  error: unknown,
  seen: Set<unknown> = new Set()
): AtomErrorJSON | unknown {
  if (error == null || typeof error !== 'object') return error;
  if (seen.has(error)) {
    const name = 'name' in error ? Reflect.get(error, 'name') : undefined;
    const recoverable = 'recoverable' in error ? Reflect.get(error, 'recoverable') : undefined;
    const code = 'code' in error ? Reflect.get(error, 'code') : undefined;
    return {
      name: typeof name === 'string' ? name : 'Object',
      message: '[Circular Reference]',
      recoverable: typeof recoverable === 'boolean' ? recoverable : true,
      code: typeof code === 'string' ? code : undefined,
    };
  }

  seen.add(error);

  if (isError(error)) {
    const cause = 'cause' in error ? Reflect.get(error, 'cause') : undefined;
    const recoverable = 'recoverable' in error ? Reflect.get(error, 'recoverable') : undefined;
    const code = 'code' in error ? Reflect.get(error, 'code') : undefined;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeError(cause, seen),
      recoverable: typeof recoverable === 'boolean' ? recoverable : true,
      code: typeof code === 'string' ? code : undefined,
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
 * @param errorConstructor - The system error class to instantiate.
 * @param context - Human-readable context (e.g., 'Computed: userId').
 * @returns A structured `AtomError` instance.
 */
export function wrapError(
  error: unknown,
  errorConstructor: AtomErrorConstructor,
  context: string
): AtomError {
  const meta = getErrorMetadata(error);

  return new errorConstructor(AtomError.format(meta.name, context, meta.message), {
    cause: error,
    recoverable: meta.recoverable,
    code: meta.code,
  });
}

/**
 * @internal
 * Safe helper to check if a value is an object (record) and not null.
 */
function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * @internal
 * Optimization: Converts a value to its string representation safely.
 * Gracefully catches exceptions thrown by null-prototype or custom toString methods.
 */
const toSafeString = (value: unknown, fallback: string | undefined): string | undefined => {
  if (value == null) return fallback;
  try {
    return String(value);
  } catch {
    return fallback;
  }
};

/**
 * @internal
 * Logic: Normalization sequence for converting foreign exceptions into system errors.
 * Handles standard JavaScript errors and cross-context exceptions gracefully.
 */
export interface ErrorMetadata {
  name: string;
  message: string;
  recoverable: boolean;
  code: string | undefined;
}

/**
 * Logic: Heuristic Metadata Extraction
 * Extracts meaningful data from non-standard error objects or primitives.
 * @internal
 */
export function getErrorMetadata(error: unknown): ErrorMetadata {
  if (!isRecord(error)) {
    return {
      name: 'Unexpected error',
      message: toSafeString(error, '') ?? '',
      recoverable: true,
      code: undefined,
    };
  }

  // Case A: Standard or custom Error objects
  if (isError(error)) {
    const recoverable = 'recoverable' in error ? Reflect.get(error, 'recoverable') : undefined;
    const code = 'code' in error ? Reflect.get(error, 'code') : undefined;
    return {
      name: error.name,
      message: error.message,
      recoverable: typeof recoverable === 'boolean' ? recoverable : true,
      code: typeof code === 'string' ? code : undefined,
    };
  }

  // Case B: Brand-based objects (tag ending with 'Error')
  try {
    const tag = Reflect.get(error, '_tag');
    if (typeof tag === 'string' && tag.endsWith('Error')) {
      const errorName = Reflect.get(error, 'name');
      const errorMessage = Reflect.get(error, 'message');
      const isRecoverable = Reflect.get(error, 'recoverable');
      const errorCode = Reflect.get(error, 'code');
      return {
        name: toSafeString(errorName, '') ?? '',
        message: toSafeString(errorMessage, '') ?? '',
        recoverable: isRecoverable !== false,
        code: toSafeString(errorCode, undefined),
      };
    }
  } catch {
    // Fall through if getter execution throws
  }

  // Case C: Plain object / unexpected fallback
  return {
    name: 'Unexpected error',
    message: toSafeString(error, '') ?? '',
    recoverable: true,
    code: undefined,
  };
}
