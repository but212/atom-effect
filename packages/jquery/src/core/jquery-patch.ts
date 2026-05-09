import { batch } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { PatchOptions } from '@/types';
import { INTERNAL_HANDLER } from './symbols';

/** Alias for common jQuery event handler types. @internal */
type EventHandler = JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;

/** A mapping of original user-defined handlers to their batch-wrapped counterparts. */
const handlerMap = new WeakMap<EventHandler, EventHandler>();

/** Internal union type for various jQuery event map values. @internal */
type JQueryEventHandler = EventHandler | boolean;

/** Extended EventHandler interface to include internal marker. @internal */
interface InternalHandler extends EventHandler {
  [INTERNAL_HANDLER]?: boolean;
}

/** Metadata storing references to native jQuery methods before patching. */
type OriginalMethods = {
  on: typeof $.fn.on;
  one: typeof $.fn.one;
  off: typeof $.fn.off;
  remove: typeof $.fn.remove;
  empty: typeof $.fn.empty;
  detach: typeof $.fn.detach;
};

/** Global storage for native jQuery methods to allow restoration. */
let originals: OriginalMethods | null = null;

/**
 * Wraps a standard event handler function in a reactive batch.
 *
 * Logic: Auto-Batching
 * Performance Note: Removed Option utility to minimize overhead in event hot-paths.
 * @internal
 */
const wrapHandler = (fn: EventHandler): EventHandler => {
  if ((fn as InternalHandler)[INTERNAL_HANDLER]) return fn;

  const cached = handlerMap.get(fn);
  if (cached) return cached;

  const wrapped = function (this: unknown, ...args: unknown[]) {
    return batch(() => fn.apply(this, args as Parameters<EventHandler>));
  } as unknown as InternalHandler;

  wrapped[INTERNAL_HANDLER] = true;
  handlerMap.set(fn, wrapped);
  return wrapped;
};

/**
 * Retrieves the original handler function from a wrapped version.
 * @internal
 */
const unwrapHandler = (fn: EventHandler): EventHandler => {
  return handlerMap.get(fn) ?? fn;
};

/**
 * Normalizes and wraps all handlers within a jQuery event map.
 * Optimized with a for-in loop to avoid intermediate entry arrays.
 * @internal
 */
function wrapEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler | undefined> {
  const result: Record<string, JQueryEventHandler> = {};
  for (const key in map) {
    const fn = map[key];
    result[key] = typeof fn === 'function' ? wrapHandler(fn) : (fn as JQueryEventHandler);
  }
  return result;
}

/**
 * Normalizes and unwraps all handlers within a jQuery event map.
 * Optimized with a for-in loop.
 * @internal
 */
function unwrapEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler | undefined> {
  const result: Record<string, JQueryEventHandler | undefined> = {};
  for (const key in map) {
    const fn = map[key];
    result[key] = typeof fn === 'function' ? unwrapHandler(fn) : fn;
  }
  return result;
}

/**
 * Utility for modifying jQuery method arguments to wrap or unwrap handlers.
 * @internal
 */
function patchArguments(
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
    // Standard jQuery signature: .on( types [, selector ] [, data ], handler )
    // We scan for function arguments to wrap/unwrap them.
    for (let i = 1; i < args.length; i++) {
      if (typeof args[i] === 'function') {
        args[i] = handlerProcessor(args[i] as EventHandler);
      }
    }
  }
}

/**
 * Enables global patches for jQuery to integrate reactive state management.
 * @internal
 */
export function enablejQueryOverrides(options: PatchOptions = {}): void {
  if (originals !== null) return;

  const { events = true, lifecycle = true } = options;

  originals = {
    on: $.fn.on,
    one: $.fn.one,
    off: $.fn.off,
    remove: $.fn.remove,
    empty: $.fn.empty,
    detach: $.fn.detach,
  };
  const prev = originals;

  if (lifecycle) {
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
      return prev.remove.call(this, selector);
    };

    $.fn.empty = function (this: JQuery) {
      const len = this.length;
      for (let i = 0; i < len; i++) {
        const el = this[i];
        if (el?.hasChildNodes()) {
          registry.cleanupDescendants(el);
        }
      }
      return prev.empty.call(this);
    };

    $.fn.detach = function (this: JQuery, selector?: string) {
      const targets = selector ? this.filter(selector) : this;
      const len = targets.length;
      for (let i = 0; i < len; i++) {
        const el = targets[i];
        if (el) {
          registry.keep(el);
        }
      }
      return prev.detach.call(this, selector);
    };
  }

  if (events) {
    $.fn.on = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, wrapEventMap, wrapHandler);
      return prev.on.apply(this, args as Parameters<typeof $.fn.on>);
    };

    $.fn.one = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, wrapEventMap, wrapHandler);
      return prev.one.apply(this, args as Parameters<typeof $.fn.one>);
    };

    $.fn.off = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, unwrapEventMap, unwrapHandler);
      return prev.off.apply(this, args as Parameters<typeof $.fn.off>);
    };
  }
}

/**
 * Restores jQuery prototype methods to their original native state.
 * @internal
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
