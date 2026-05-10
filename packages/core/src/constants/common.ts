/**
 * Subscriber Kind Discriminators
 * @internal
 */
export const KIND = {
  Fn: 0,
  Obj: 1,
} as const;

/**
 * Asynchronous operation states for public API consumption.
 *
 * When to use:
 * - To verify or branch logic based on the status of an asynchronous atom or computed node.
 *
 * @example
 * ```typescript
 * import { AsyncState } from '@but212/atom-effect';
 *
 * if (userProfile.status === AsyncState.PENDING) {
 *   showSpinner();
 * }
 * ```
 */
export const AsyncState = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} satisfies Record<string, string>);

/**
 * Optimization: Shared Immutable Empty State
 *
 * Constraint: Must remain immutable to prevent memory leaks and unexpected
 * side-effects in subscriber logic that expects an array structure.
 *
 * @internal
 */
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);

/**
 * Standard log prefix for consistent console output.
 * @internal
 */
export const LOG_PREFIX = '[atom-effect]';

/**
 * Default equality function used across the core engine.
 * @internal
 */
export const DEFAULT_EQUAL = Object.is;
