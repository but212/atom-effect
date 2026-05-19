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
 * Logic: Reactive Dependency Injection
 * Event name used for the bubbling context discovery mechanism.
 * Descendant elements dispatch this event to locate reactive providers
 * higher in the DOM tree, including across Shadow DOM boundaries.
 */
export const CONTEXT_REQUEST = 'aej:context-request';

/**
 * Payload structure for context discovery events.
 * @internal
 */
export interface ContextRequestDetail {
  /** The unique key or symbol of the requested context. */
  key: string | symbol;
  /** A callback executed by the provider to deliver the reactive value. */
  callback: (atom: unknown) => void;
}

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
