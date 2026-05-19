/**
 * @module ErrorTypes
 *
 * Responsibility:
 * Defines the structural contracts for errors within the reactive engine.
 * Ensures consistent error shapes for debugging, serialization, and recovery.
 *
 * Design Intent:
 * Facilitates cross-context error propagation (e.g., Worker threads) by
 * providing a serializable JSON contract.
 */

import type { AtomError } from '@/utils/errors';

/**
 * Role: Serializable Error Contract
 * Provides a structured JSON representation of an `AtomError` for cross-context
 * transport or persistence.
 */
export interface AtomErrorJSON {
  /** The specific name of the error class. */
  name: string;
  /** The human-readable error message. */
  message: string;
  /** Machine-readable error identifier for programmatic filtering. */
  code?: string | undefined;
  /**
   * Impact: Recovery Logic
   * When true, the reactive engine interprets the error as transient and may
   * attempt to re-execute the failed node during the next flush.
   */
  recoverable: boolean;
  /** Trace information. */
  stack?: string | undefined;
  /** The underlying cause resolved into a serializable plain object. */
  cause?: unknown | undefined;
}

/**
 * Role: Configuration for Error Instantiation
 */
export interface AtomErrorOptions {
  /** The underlying cause of the error. */
  cause?: unknown;
  /**
   * Impact: Scheduler Behavior
   * If true, signals to the scheduler that the error is not terminal.
   */
  recoverable?: boolean | undefined;
  /** Unique category identifier for programmatic handling. */
  code?: string | undefined;
}

/**
 * Role: Constructor signature for system-branded error classes.
 * @internal
 */
export type AtomErrorConstructor = new (message: string, options?: AtomErrorOptions) => AtomError;
