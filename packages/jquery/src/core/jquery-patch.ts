import { batch } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';

/** Generic event handler type matching jQuery's internal handler signature. */
type EventHandler = JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;

/**
 * Symbol marker attached to handlers registered by this library's internals.
 * Handlers carrying this marker are NOT wrapped in batch() — they already
 * manage atom writes directly and do not need an extra reactive flush.
 */
export const INTERNAL_HANDLER = Symbol.for('atom-effect-internal');

/**
 * Symbol used to store the wrapped version of a handler directly on the original
 * function. This enables different instances of the library to correctly
 * identify and unbind handlers registered by others.
 */
export const WRAPPED_HANDLER = Symbol.for('atom-effect-wrapped');

/** Matches jQuery handler signature with internal metadata properties. */
interface JQueryHandlerInternal extends Function {
  [INTERNAL_HANDLER]?: boolean;
  [WRAPPED_HANDLER]?: EventHandler;
}

const handlerMap = new WeakMap<EventHandler, EventHandler>();

// ============================================================================
// Originals store
// ============================================================================

type JQueryEventHandler = EventHandler | boolean;

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
  one: typeof $.fn.one;
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
  const internal = fn as unknown as JQueryHandlerInternal;

  // Fast check: is already wrapped?
  if (internal[INTERNAL_HANDLER]) return fn;

  // 1. Check direct property (for cross-instance/bundle compatibility)
  let wrapped = internal[WRAPPED_HANDLER];
  if (wrapped) return wrapped;

  // 2. Check local map
  wrapped = handlerMap.get(fn);

  if (!wrapped) {
    wrapped = function (this: unknown, ...args: unknown[]) {
      return batch(() => fn.apply(this, args as Parameters<EventHandler>));
    } as unknown as EventHandler;
    (wrapped as unknown as JQueryHandlerInternal)[INTERNAL_HANDLER] = true;

    // Store in both places
    handlerMap.set(fn, wrapped);
    try {
      internal[WRAPPED_HANDLER] = wrapped;
    } catch {
      // Ignore if function is not extensible (rare for event handlers)
    }
  }
  return wrapped;
};

const resolveWrapped = (fn: EventHandler): EventHandler => {
  const internal = fn as unknown as JQueryHandlerInternal;
  return internal[WRAPPED_HANDLER] ?? handlerMap.get(fn) ?? fn;
};

function wrapEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler> {
  const newMap: Record<string, JQueryEventHandler> = {};
  for (const k in map) {
    const fn = map[k];
    if (typeof fn === 'function') newMap[k] = getWrappedHandler(fn);
    else if (fn !== undefined) newMap[k] = fn;
  }
  return newMap;
}

function resolveOffEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler | undefined> {
  const newMap: Record<string, JQueryEventHandler | undefined> = {};
  for (const k in map) {
    const h = map[k];
    if (typeof h === 'function') newMap[k] = resolveWrapped(h);
    else newMap[k] = h;
  }
  return newMap;
}

/**
 * Common logic to detect and process event handler functions in jQuery argument lists.
 * jQuery standard signatures are:
 * - Positional: (types, [selector], [data], handler, ...)
 * - Map: (map, [selector], [data], ...)
 */
function patchEventArguments(
  args: unknown[],
  mapProcessor: (
    map: Record<string, JQueryEventHandler | undefined>
  ) => Record<string, JQueryEventHandler | undefined>,
  handlerProcessor: (fn: EventHandler) => EventHandler
) {
  const first = args[0];
  if (first && typeof first === 'object') {
    args[0] = mapProcessor(first as Record<string, JQueryEventHandler | undefined>);
  } else {
    // Scan positional arguments (skipping types at index 0) for handler functions.
    for (let i = 1; i < args.length; i++) {
      if (typeof args[i] === 'function') {
        args[i] = handlerProcessor(args[i] as EventHandler);
      }
    }
  }
}

function createEventHandlerPatch(origFn: Function) {
  return function (this: JQuery, ...args: unknown[]) {
    patchEventArguments(args, wrapEventMap, getWrappedHandler);
    return origFn.apply(this, args) ?? this;
  };
}

// ============================================================================
// Public API
// ============================================================================

export function enablejQueryOverrides(): void {
  if (originals !== null) return;

  originals = {
    on: $.fn.on,
    one: $.fn.one,
    off: $.fn.off,
    remove: $.fn.remove,
    empty: $.fn.empty,
    detach: $.fn.detach,
  };
  const orig = originals;

  $.fn.remove = function (this: JQuery, selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    const len = targets.length;
    for (let i = 0; i < len; i++) {
      const el = targets[i];
      if (el) {
        registry.markIgnored(el);
        registry.cleanupTree(el);
      }
    }
    return orig.remove.call(this, selector) ?? this;
  };

  $.fn.empty = function (this: JQuery) {
    const len = this.length;
    for (let i = 0; i < len; i++) {
      const el = this[i];
      if (el?.hasChildNodes()) registry.cleanupDescendants(el);
    }
    return orig.empty.call(this) ?? this;
  };

  $.fn.detach = function (this: JQuery, selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    const len = targets.length;
    for (let i = 0; i < len; i++) {
      const el = targets[i];
      if (el) registry.keep(el);
    }
    return orig.detach.call(this, selector) ?? this;
  };

  // --- Event Handling Patches ---

  $.fn.on = createEventHandlerPatch(orig.on) as typeof $.fn.on;
  $.fn.one = createEventHandlerPatch(orig.one) as typeof $.fn.one;

  $.fn.off = function (this: JQuery, ...args: unknown[]) {
    patchEventArguments(args, resolveOffEventMap, resolveWrapped);
    return orig.off.apply(this, args as Parameters<typeof $.fn.off>) ?? this;
  };
}

/**
 * Restores all jQuery methods patched by `enablejQueryOverrides()`.
 * Primarily useful in test environments to reset state between suites.
 */
export function disablejQueryOverrides(): void {
  if (originals === null) return;

  $.fn.on = originals.on;
  $.fn.one = originals.one;
  $.fn.off = originals.off;
  $.fn.remove = originals.remove;
  $.fn.empty = originals.empty;
  $.fn.detach = originals.detach;

  originals = null;
}
