/**
 * @module Error_Types
 *
 * Responsibility:
 * Defines the structural contracts for errors within the reactive engine.
 */

import type { AtomError } from '@/utils/errors';

/**
 * Role: Structured JSON representation of an `AtomError` for cross-context transport.
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
 * Role: Constructor signature for system-branded error classes.
 * @internal
 */
export type AtomErrorConstructor = new (
  message: string,
  cause?: unknown,
  recoverable?: boolean,
  code?: string
) => AtomError;
