/**
 * @module AEJSymbols
 *
 * Responsibility:
 * Defines unique symbols and event names used for internal library state
 * tracking, dependency injection, and resource management.
 */

/**
 * Logic: Hydration State Tracking
 * Marks a DOM element as having been processed by reactive bindings.
 */
export const HYDRATION_MARKER = Symbol.for('aej:hydrated');

/**
 * Logic: Resource Disposal Orchestration
 * Indicates that an element has an active lifecycle MutationObserver attached.
 */
export const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');

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
