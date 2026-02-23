import { batch } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from './registry';
import { hasOwn } from './utils';

/** Generic event handler type matching jQuery's internal handler signature. */
type EventHandler = JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;

/**
 * Symbol marker attached to handlers registered by this library's internals.
 * Handlers carrying this marker are NOT wrapped in batch() — they already
 * manage atom writes directly and do not need an extra reactive flush.
 */
export const INTERNAL_HANDLER = Symbol('atom-effect-internal');

/**
 * WeakMap from original handler function → batch-wrapped handler function.
 * Keys are functions (held alive by jQuery's internal event store for as long
 * as the handler is registered), so entries are naturally released when the
 * handler is removed via .off() and jQuery drops its reference.
 */
const handlerMap = new WeakMap<EventHandler, EventHandler>();

// ============================================================================
// Originals store
// ============================================================================

/**
 * Snapshot of jQuery prototype methods captured at `enablejQueryOverrides()`
 * time and restored by `disablejQueryOverrides()`.
 *
 * Stored as a typed object and captured into `orig` (a local const) inside
 * `enablejQueryOverrides` so that the override closures always reference the
 * pre-patch methods even if `disablejQueryOverrides()` later resets the
 * module-level `originals` variable to null.
 */
type OriginalMethods = {
  on: typeof $.fn.on;
  off: typeof $.fn.off;
  remove: typeof $.fn.remove;
  empty: typeof $.fn.empty;
  detach: typeof $.fn.detach;
};

let originals: OriginalMethods | null = null;

// ============================================================================
// Internal helpers
// ============================================================================

const getWrappedHandler = (fn: EventHandler): EventHandler => {
  // Skip wrapping for library-internal handlers.
  if ((fn as unknown as Record<symbol, true>)[INTERNAL_HANDLER]) return fn;

  let wrapped = handlerMap.get(fn);
  if (!wrapped) {
    // `function` (not arrow) to preserve the jQuery-provided `this` context.
    // Double cast via `unknown` is required because the rest-args signature
    // `(...args: unknown[])` is not directly assignable to `EventHandler`.
    wrapped = function (this: unknown, ...args: unknown[]) {
      return batch(() => fn.apply(this, args as Parameters<EventHandler>));
    } as unknown as EventHandler;
    // Mark the wrapper itself as internal so it isn't double-wrapped if passed again.
    (wrapped as unknown as Record<symbol, true>)[INTERNAL_HANDLER] = true;
    handlerMap.set(fn, wrapped);
  }
  return wrapped;
};

/**
 * Wraps each handler in an `.on()` event-map with `getWrappedHandler`.
 * Skips keys whose value is falsy — mirrors jQuery's own behaviour of ignoring
 * undefined handlers in event-maps.
 * Uses `for...in` with `hasOwnProperty` guard to iterate own properties only,
 * consistent with the `for` loops used elsewhere in this file.
 */
function wrapEventMap(map: Record<string, EventHandler>): Record<string, EventHandler> {
  const newMap: Record<string, EventHandler> = {};
  for (const key in map) {
    if (hasOwn.call(map, key)) {
      const handler = map[key];
      if (handler) newMap[key] = getWrappedHandler(handler);
    }
  }
  return newMap;
}

/**
 * Resolves the wrapped counterpart for each handler in an `.off()` event-map.
 * Preserves `undefined` values — `.off({ click: undefined })` is a valid
 * jQuery call that removes ALL listeners for that event type.
 * Uses `for...in` with `hasOwnProperty` guard, consistent with `wrapEventMap`.
 */
function resolveOffEventMap(
  map: Record<string, EventHandler | undefined>
): Record<string, EventHandler | undefined> {
  const newMap: Record<string, EventHandler | undefined> = {};
  for (const key in map) {
    if (hasOwn.call(map, key)) {
      const handler = map[key];
      newMap[key] = handler ? (handlerMap.get(handler) ?? handler) : undefined;
    }
  }
  return newMap;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Patches jQuery's `.on()`, `.off()`, `.remove()`, `.empty()`, and `.detach()`
 * to integrate with the reactive system:
 * - Event handlers are wrapped in `batch()` for efficient atom flushing.
 * - DOM removal triggers reactive binding cleanup.
 * - `.detach()` preserves bindings for re-attachment.
 *
 * Idempotent — calling more than once has no effect.
 * Call `disablejQueryOverrides()` to restore original methods.
 */
export function enablejQueryOverrides(): void {
  if (originals !== null) return;

  originals = {
    on: $.fn.on,
    off: $.fn.off,
    remove: $.fn.remove,
    empty: $.fn.empty,
    detach: $.fn.detach,
  };

  // Capture into a local const so the closures below always hold a stable
  // reference to the originals even after disablejQueryOverrides() resets
  // the module-level `originals` variable to null.
  const orig = originals;

  // --- Lifecycle overrides ---

  // .remove() — clean up bindings on the matching elements, then delegate.
  // Only elements matched by `selector` (or all elements when selector is
  // omitted) are cleaned up — other elements in `this` are not affected,
  // mirroring jQuery's own selector-scoped remove behaviour.
  $.fn.remove = function (this: JQuery, selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    for (let i = 0, len = targets.length; i < len; i++) {
      const el = targets[i];
      if (el) {
        // markIgnored BEFORE cleanupTree: a MutationObserver callback that
        // fires synchronously during removal will see the ignored flag and
        // skip the redundant second cleanup pass.
        registry.markIgnored(el);
        registry.cleanupTree(el);
      }
    }
    return orig.remove.call(this, selector);
  };

  // .empty() — recursively clean up descendants, then delegate.
  $.fn.empty = function (this: JQuery) {
    for (let i = 0, len = this.length; i < len; i++) {
      const el = this[i];
      if (el) registry.cleanupDescendants(el);
    }
    return orig.empty.call(this);
  };

  // .detach() — mark elements as kept so the MutationObserver does not
  // dispose their bindings while they are temporarily out of the DOM.
  $.fn.detach = function (this: JQuery, selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    for (let i = 0, len = targets.length; i < len; i++) {
      const el = targets[i];
      if (el) registry.keep(el);
    }
    return orig.detach.call(this, selector);
  };

  // --- Event overrides ---

  // .on() — wrap the handler argument in batch().
  //
  // jQuery's full signature is: .on(events, selector?, data?, handler)
  // When the first arg is an object it is an event-map; otherwise the handler
  // is always the LAST argument (position 1, 2, or 3 depending on overload).
  // Iterating from the end and stopping at the first function is therefore
  // correct for the positional form, because `data` is never a function in
  // jQuery's documented API.
  // `...args: unknown[]` is used instead of jQuery's overloaded signature
  // because TypeScript cannot unify the 4+ overloads into a single rest type.
  // The casts at args[0] and the apply call site are therefore unavoidable.
  $.fn.on = function (this: JQuery, ...args: unknown[]) {
    const types = args[0];

    if (types && typeof types === 'object') {
      args[0] = wrapEventMap(types as Record<string, EventHandler>);
    } else {
      for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === 'function') {
          args[i] = getWrappedHandler(args[i] as EventHandler);
          break;
        }
      }
    }

    return orig.on.apply(this, args as Parameters<typeof $.fn.on>);
  };

  // .off() — resolve the original handler back to its wrapped counterpart so
  // jQuery can find and remove the correct internal listener.
  $.fn.off = function (this: JQuery, ...args: unknown[]) {
    const types = args[0];

    if (types && typeof types === 'object') {
      args[0] = resolveOffEventMap(types as Record<string, EventHandler | undefined>);
    } else {
      for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === 'function') {
          const fn = args[i] as EventHandler;
          args[i] = handlerMap.get(fn) ?? fn;
          break;
        }
      }
    }

    return orig.off.apply(this, args as Parameters<typeof $.fn.off>);
  };
}

/**
 * Restores all jQuery methods patched by `enablejQueryOverrides()`.
 * Primarily useful in test environments to reset state between suites.
 */
export function disablejQueryOverrides(): void {
  if (originals === null) return;

  $.fn.on = originals.on;
  $.fn.off = originals.off;
  $.fn.remove = originals.remove;
  $.fn.empty = originals.empty;
  $.fn.detach = originals.detach;

  originals = null;
}
