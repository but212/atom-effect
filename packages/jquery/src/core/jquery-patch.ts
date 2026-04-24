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
 * This ensures that multiple atom updates triggered by a single interaction
 * (e.g., a 'click' event) are processed atomically. This prevents intermediate
 * UI states, visual jitter, and redundant re-computations.
 *
 * @param fn - The original event handler function.
 * @returns A wrapped handler function that executes within a batch.
 * @internal
 */
const wrapHandler = (fn: EventHandler): EventHandler => {
  if ((fn as unknown as { [INTERNAL_HANDLER]?: boolean })[INTERNAL_HANDLER]) {
    return fn;
  }

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

/**
 * Retrieves the original handler function from a wrapped version.
 * @internal
 */
const unwrapHandler = (fn: EventHandler): EventHandler => {
  return handlerMap.get(fn) ?? fn;
};

/** Normalizes and wraps all handlers within a jQuery event map. @internal */
function wrapEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler> {
  const newMap: Record<string, JQueryEventHandler> = {};
  for (const key in map) {
    const fn = map[key];
    newMap[key] = typeof fn === 'function' ? wrapHandler(fn) : (fn as JQueryEventHandler);
  }
  return newMap;
}

/** Normalizes and unwraps all handlers within a jQuery event map. @internal */
function unwrapEventMap(
  map: Record<string, JQueryEventHandler | undefined>
): Record<string, JQueryEventHandler | undefined> {
  const newMap: Record<string, JQueryEventHandler | undefined> = {};
  for (const key in map) {
    const handler = map[key];
    newMap[key] = typeof handler === 'function' ? unwrapHandler(handler) : handler;
  }
  return newMap;
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
    for (let i = 1; i < args.length; i++) {
      if (typeof args[i] === 'function') {
        args[i] = handlerProcessor(args[i] as EventHandler);
      }
    }
  }
}

/** Creates a patched version of a jQuery event attachment method. @internal */
function createPatch(original: Function) {
  return function (this: JQuery, ...args: unknown[]) {
    patchArguments(args, wrapEventMap, wrapHandler);
    return original.apply(this, args) ?? this;
  };
}

/**
 * Enables global patches for jQuery to integrate reactive state management.
 *
 * Logic: Global Patch Responsibilities
 * 1. Auto-Batching: Intercepts `$.fn.on` and `$.fn.one` to wrap all event handlers
 *    in `batch()`, ensuring atomic UI updates.
 * 2. Automated Cleanup: Hooks into `$.fn.remove` and `$.fn.empty` to automatically
 *    dispose of reactive effects via the `registry` when elements are destroyed.
 * 3. Lifecycle Preservation: Hooks into `$.fn.detach` to allow reactive resources
 *    to be kept in memory for later re-attachment.
 *
 * @param options - Configuration to selectively enable event or lifecycle patches.
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
          // Logic: Stop all associated reactive effects immediately upon removal.
          registry.markIgnored(el);
          registry.cleanupTree(el);
        }
      }
      return prev.remove.call(this, selector) ?? this;
    };

    $.fn.empty = function (this: JQuery) {
      const len = this.length;
      for (let i = 0; i < len; i++) {
        const el = this[i];
        // Logic: Clean up all reactive resources within the container's subtree.
        if (el?.hasChildNodes()) {
          registry.cleanupDescendants(el);
        }
      }
      return prev.empty.call(this) ?? this;
    };

    $.fn.detach = function (this: JQuery, selector?: string) {
      const targets = selector ? this.filter(selector) : this;
      const len = targets.length;
      for (let i = 0; i < len; i++) {
        const el = targets[i];
        // Logic: Mark the element tree to preserve its reactive resources despite detachment.
        if (el) {
          registry.keep(el);
        }
      }
      return prev.detach.call(this, selector) ?? this;
    };
  }

  if (events) {
    $.fn.on = createPatch(prev.on) as typeof $.fn.on;
    $.fn.one = createPatch(prev.one) as typeof $.fn.one;

    $.fn.off = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, unwrapEventMap, unwrapHandler);
      return prev.off.apply(this, args as Parameters<typeof $.fn.off>) ?? this;
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
