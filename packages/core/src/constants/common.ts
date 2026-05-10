/**
 * @module CommonConstants
 *
 * Responsibility:
 * Provides shared primitive constants, discriminators, and default configurations
 * used across the reactive engine.
 */

/**
 * Subscriber Kind Discriminators.
 *
 * Why: Used to differentiate between function-based and object-based subscribers
 * in the reactive propagation loop without expensive `typeof` or `instanceof` checks.
 *
 * @internal
 */
export const KIND = {
  Fn: 0,
  Obj: 1,
} as const;

/**
 * States for asynchronous operations.
 *
 * When to use:
 * - To branch logic or UI transitions based on the status of an asynchronous node.
 * - To check if a computation is currently fetching data.
 *
 * Constraints:
 * - These are read-only string literals.
 *
 * @example
 * import { AsyncState } from '@but212/atom-effect';
 *
 * if (node.status === AsyncState.PENDING) {
 *   renderSpinner();
 * }
 */
export const AsyncState = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} satisfies Record<string, string>);

/**
 * Shared Immutable Empty State.
 *
 * Why: Reduces GC pressure by avoiding repeated empty array allocations
 * during frequent state updates in nodes that have no errors.
 *
 * @internal
 */
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);

/**
 * Prefix for all internal logging, warnings, and errors.
 * @internal
 */
export const LOG_PREFIX = '[atom-effect]';

/**
 * Prefix for development diagnostic messages.
 * @internal
 */
export const DEBUG_PREFIX = '[Atom Effect]';

/**
 * Default equality check for state change detection.
 *
 * Why: `Object.is` is used instead of `===` because it correctly handles
 * edge cases like `NaN` and `+0/-0`, preventing unnecessary re-computations
 * or infinite loops when these values are updated.
 *
 * @internal
 */
export const DEFAULT_EQUAL = Object.is;
