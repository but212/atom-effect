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
  if ((fn as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER]) return fn;
  let wrapped = handlerMap.get(fn);
  if (!wrapped) {
    wrapped = function (this: unknown, ...args: unknown[]) {
      return batch(() => fn.apply(this, args as Parameters<EventHandler>));
    } as unknown as EventHandler;
    (wrapped as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
    handlerMap.set(fn, wrapped);
  }
  return wrapped;
};

function wrapEventMap(map: Record<string, EventHandler>): Record<string, EventHandler> {
  const newMap: Record<string, EventHandler> = {};
  for (const k in map) if (map[k]) newMap[k] = getWrappedHandler(map[k]);
  return newMap;
}

function resolveOffEventMap(
  map: Record<string, EventHandler | undefined>
): Record<string, EventHandler | undefined> {
  const newMap: Record<string, EventHandler | undefined> = {};
  for (const k in map) {
    const h = map[k];
    newMap[k] = h ? (handlerMap.get(h) ?? h) : undefined;
  }
  return newMap;
}

// ============================================================================
// Public API
// ============================================================================

export function enablejQueryOverrides(): void {
  if (originals !== null) return;

  originals = {
    on: $.fn.on,
    off: $.fn.off,
    remove: $.fn.remove,
    empty: $.fn.empty,
    detach: $.fn.detach,
  };
  const orig = originals;

  $.fn.remove = function (selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    for (let i = 0, len = targets.length; i < len; i++) {
      const el = targets[i];
      if (el) {
        registry.markIgnored(el);
        registry.cleanupTree(el);
      }
    }
    return orig.remove.call(this, selector) ?? this;
  };

  $.fn.empty = function () {
    for (let i = 0, len = this.length; i < len; i++) {
      if (this[i]?.hasChildNodes()) registry.cleanupDescendants(this[i]!);
    }
    return orig.empty.call(this) ?? this;
  };

  $.fn.detach = function (selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    for (let i = 0, len = targets.length; i < len; i++) {
      if (targets[i]) registry.keep(targets[i]!);
    }
    return orig.detach.call(this, selector) ?? this;
  };

  $.fn.on = function (this: JQuery, ...args: unknown[]) {
    const types = args[0];
    if (types && typeof types === 'object') {
      args[0] = wrapEventMap(types as Record<string, EventHandler>);
    } else {
      const last = args.length - 1;
      if (last >= 0 && typeof args[last] === 'function') {
        args[last] = getWrappedHandler(args[last] as EventHandler);
      }
    }
    return orig.on.apply(this, args as Parameters<typeof $.fn.on>) ?? this;
  };

  $.fn.off = function (this: JQuery, ...args: unknown[]) {
    const types = args[0];
    if (types && typeof types === 'object') {
      args[0] = resolveOffEventMap(types as Record<string, EventHandler | undefined>);
    } else {
      const last = args.length - 1;
      if (last >= 0 && typeof args[last] === 'function') {
        const fn = args[last] as EventHandler;
        args[last] = handlerMap.get(fn) ?? fn;
      }
    }
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
  $.fn.off = originals.off;
  $.fn.remove = originals.remove;
  $.fn.empty = originals.empty;
  $.fn.detach = originals.detach;

  originals = null;
}
