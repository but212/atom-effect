/**
 * @module AEJSymbols
 *
 * Responsibility:
 * Defines unique symbols and event names used for internal library state
 * tracking, dependency injection, and resource management.
 */

/**
 * Logic: Batch Coalescing Marker
 * Marks event handlers as already wrapped in a reactive batch.
 *
 * Reason: Execution Stack Flattening
 * Prevents redundant nested `batch()` calls when re-binding handlers
 * or during multiple patch cycles.
 *
 * @internal
 */
export const INTERNAL_HANDLER = Symbol.for('atom-effect-internal');

/**
 * Logic: Internal Handler Marking
 * Marks a function as an internal handler to bypass global jQuery patching.
 *
 * Why: Performance
 * Prevents redundant update cycles by skipping the `$.fn.on` batching wrapper.
 */
export const markInternal = (callback: (...args: never[]) => unknown): void => {
  Object.assign(callback, { [INTERNAL_HANDLER]: true });
};
