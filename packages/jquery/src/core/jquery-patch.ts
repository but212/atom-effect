import { batch } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';

type EventHandler = JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;

/** Symbol used to mark handlers as processed, avoiding redundant wrapping in batch(). */
export const INTERNAL_HANDLER = Symbol.for('atom-effect-internal');

/** Maps original developer functions to their corresponding batch-wrapped versions. */
const handlerMap = new WeakMap<EventHandler, EventHandler>();

type JQueryEventHandler = EventHandler | boolean;

type OriginalMethods = {
  on: typeof $.fn.on;
  one: typeof $.fn.one;
  off: typeof $.fn.off;
  remove: typeof $.fn.remove;
  empty: typeof $.fn.empty;
  detach: typeof $.fn.detach;
};

let originals: OriginalMethods | null = null;

/**
 * Wraps a standard jQuery event handler in a 'batch()' block.
 * This ensures that multiple atom updates triggered by a single event
 * (e.g., click) only trigger a single collective re-render.
 */
const getWrappedHandler = (fn: EventHandler): EventHandler => {
  if ((fn as unknown as { [INTERNAL_HANDLER]?: boolean })[INTERNAL_HANDLER]) return fn;

  let wrapped = handlerMap.get(fn);

  if (!wrapped) {
    wrapped = function (this: unknown, ...args: unknown[]) {
      return batch(() => fn.apply(this, args as Parameters<EventHandler>));
    } as unknown as EventHandler;

    (wrapped as unknown as { [INTERNAL_HANDLER]?: boolean })[INTERNAL_HANDLER] = true;
    handlerMap.set(fn, wrapped);
  }
  return wrapped;
};

/** Retrieves the wrapped version of a handler so it can be passed back to jQuery's .off(). */
const resolveWrapped = (fn: EventHandler): EventHandler => {
  return handlerMap.get(fn) ?? fn;
};

function wrapEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler> {
  const newMap: Record<string, JQueryEventHandler> = {};
  for (const k in map) {
    const fn = map[k];
    newMap[k] = typeof fn === 'function' ? getWrappedHandler(fn) : (fn as JQueryEventHandler);
  }
  return newMap;
}

function resolveOffEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler | undefined> {
  const newMap: Record<string, JQueryEventHandler | undefined> = {};
  for (const k in map) {
    const h = map[k];
    newMap[k] = typeof h === 'function' ? resolveWrapped(h) : h;
  }
  return newMap;
}

/** Utility to traverse and patch jQuery arguments whether they are objects or individual parameters. */
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

/**
 * Globally overrides specific jQuery prototype methods to automate library behavior.
 *
 * Responsibilities:
 * 1. Auto-Batching: Wraps all event handlers in 'batch()' to prevent UI jitter.
 * 2. Lifecycle Sync: Hooking .remove()/.empty() to stop reactive effects on deleted elements.
 * 3. Persistence: Hooking .detach() to preserve effects when nodes are moved temporarily.
 * 4. Identity Management: Uses a WeakMap so .off(originalFn) still works correctly.
 */
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
        // Condition: Mark ignored to prevent duplicate cleanup cycles if jQuery
        // triggers internal events during removal.
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
      // Logic: Unlike .remove(), .detach() signals that the element might reappear
      // elsewhere, so we keep its reactive effects alive.
      if (el) registry.keep(el);
    }
    return orig.detach.call(this, selector) ?? this;
  };

  $.fn.on = createEventHandlerPatch(orig.on) as typeof $.fn.on;
  $.fn.one = createEventHandlerPatch(orig.one) as typeof $.fn.one;

  $.fn.off = function (this: JQuery, ...args: unknown[]) {
    patchEventArguments(args, resolveOffEventMap, resolveWrapped);
    return orig.off.apply(this, args as Parameters<typeof $.fn.off>) ?? this;
  };
}

/** Restores original jQuery prototype methods to their clean state. */
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
