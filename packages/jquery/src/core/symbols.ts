/** Symbol used to mark a DOM element as hydrated with reactive bindings. */
export const HYDRATION_MARKER = Symbol.for('aej:hydrated');

/** Symbol used to indicate that an element has an active lifecycle MutationObserver attached. */
export const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');

/**
 * Event name used for the bubbling context discovery mechanism.
 *
 * Logic: Dependency Injection
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
 * A unique symbol used to mark event handlers as already wrapped in a batch.
 *
 * Reason: Batch Coalescing
 * This prevents redundant nested `batch()` calls when re-binding
 * handlers or during multiple patch cycles, maintaining flat execution stacks.
 *
 * @internal
 */
export const INTERNAL_HANDLER = Symbol.for('atom-effect-internal');
