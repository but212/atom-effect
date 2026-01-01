/**
 * @fileoverview Centralized error messages for better maintainability
 * @description All error messages in English for international accessibility
 * @module errors/messages
 */

/**
 * Centralized error message constants for the atom-effect library.
 *
 * @description
 * Provides consistent, maintainable error messages across the library.
 * All messages are in English for international accessibility.
 *
 * @remarks
 * - Computed errors: Related to computed atom creation and execution
 * - Atom errors: Related to atom subscription and notification
 * - Effect errors: Related to effect lifecycle and cleanup
 * - Debug warnings: Non-critical warnings for debugging
 *
 * @example
 * ```ts
 * import { ERROR_MESSAGES } from './messages';
 *
 * if (typeof fn !== 'function') {
 *   throw new Error(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
 * }
 * ```
 */
export const ERROR_MESSAGES = {
  // ─────────────────────────────────────────────────────────────────
  // Computed errors
  // ─────────────────────────────────────────────────────────────────

  /**
   * Error thrown when computed() receives a non-function argument.
   */
  COMPUTED_MUST_BE_FUNCTION: 'Computed function must be a function',

  /**
   * Error thrown when subscribe() receives a non-function listener.
   */
  COMPUTED_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber listener must be a function',

  /**
   * Error thrown when accessing a pending async computed without a default value.
   */
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation is pending. No default value provided',

  /**
   * Error thrown when a synchronous computed computation fails.
   */
  COMPUTED_COMPUTATION_FAILED: 'Computed computation failed',

  /**
   * Error thrown when an asynchronous computed computation fails.
   */
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computed computation failed',

  /**
   * Error thrown when subscribing to a dependency fails.
   */
  COMPUTED_DEPENDENCY_SUBSCRIPTION_FAILED: 'Failed to subscribe to dependency',

  // ─────────────────────────────────────────────────────────────────
  // Atom errors
  // ─────────────────────────────────────────────────────────────────

  /**
   * Error thrown when atom.subscribe() receives a non-function listener.
   */
  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscription listener must be a function',

  /**
   * Error thrown when the atom subscriber notification process fails.
   */
  ATOM_SUBSCRIBER_EXECUTION_FAILED: 'Error occurred while executing atom subscribers',

  /**
   * Error logged when an individual subscriber throws during notification.
   * @remarks This error is caught and logged to prevent cascading failures.
   */
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Error during individual atom subscriber execution',

  // ─────────────────────────────────────────────────────────────────
  // Effect errors
  // ─────────────────────────────────────────────────────────────────

  /**
   * Error thrown when effect() receives a non-function argument.
   */
  EFFECT_MUST_BE_FUNCTION: 'Effect function must be a function',

  /**
   * Error thrown when an effect's execution fails.
   */
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',

  /**
   * Error thrown when an effect's cleanup function fails.
   */
  EFFECT_CLEANUP_FAILED: 'Effect cleanup function execution failed',

  // ─────────────────────────────────────────────────────────────────
  // Debug warnings
  // ─────────────────────────────────────────────────────────────────

  /**
   * Warning message for large dependency graphs.
   *
   * @param count - The number of dependencies detected
   * @returns Formatted warning message with dependency count
   *
   * @example
   * ```ts
   * console.warn(ERROR_MESSAGES.LARGE_DEPENDENCY_GRAPH(150));
   * // Output: "Large dependency graph detected: 150 dependencies"
   * ```
   */
  LARGE_DEPENDENCY_GRAPH: (count: number): string =>
    `Large dependency graph detected: ${count} dependencies`,

  /**
   * Warning logged when attempting to unsubscribe a non-existent listener.
   */
  UNSUBSCRIBE_NON_EXISTENT: 'Attempted to unsubscribe a non-existent listener',

  /**
   * Error logged when the onError callback itself throws an error.
   * @remarks This prevents cascading failures from masking the original error.
   */
  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Error occurred during onError callback execution',
} as const;
