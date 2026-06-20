/**
 * @module AEJPatch
 *
 * Responsibility:
 * Patches jQuery prototype methods to integrate AEJ's auto-batching
 * and automated lifecycle management (hydration/cleanup).
 */

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
 * Logic: Event Auto-Batching
 * Wraps a standard event handler function in a reactive batch.
 *
 * Optimization: Hot-Path Performance
 * Removed Option utility to minimize overhead in event hot-paths.
 * @internal
 */
const wrapHandler = (eventHandler: EventHandler): EventHandler => {
  if ((eventHandler as InternalHandler)[INTERNAL_HANDLER]) return eventHandler;

  const cached = handlerMap.get(eventHandler);
  if (cached) return cached;

  const wrapped = function (this: unknown, ...args: unknown[]) {
    return batch(() => eventHandler.apply(this, args as Parameters<EventHandler>));
  } as InternalHandler;

  wrapped[INTERNAL_HANDLER] = true;
  handlerMap.set(eventHandler, wrapped);
  return wrapped;
};

/**
 * Retrieves the original handler function from a wrapped version.
 * @internal
 */
const unwrapHandler = (eventHandler: EventHandler): EventHandler => {
  return handlerMap.get(eventHandler) ?? eventHandler;
};

/**
 * Normalizes all handlers within a jQuery event map using a processor function.
 * Uses a for-in loop to avoid intermediate entry arrays for speed.
 * @internal
 */
function processEventMap(
  map: Record<string, JQueryEventHandler | undefined>,
  processor: (eventHandler: EventHandler) => EventHandler
): Record<string, JQueryEventHandler | undefined> {
  const result: Record<string, JQueryEventHandler | undefined> = {};
  for (const key in map) {
    if (Object.hasOwn(map, key)) {
      const fn = map[key];
      result[key] = typeof fn === 'function' ? processor(fn) : fn;
    }
  }
  return result;
}

/** @internal */
const wrapEventMap = (map: Record<string, JQueryEventHandler | undefined>) =>
  processEventMap(map, wrapHandler);

/** @internal */
const unwrapEventMap = (map: Record<string, JQueryEventHandler | undefined>) =>
  processEventMap(map, unwrapHandler);

/**
 * Logic: Argument Interception
 * Processes jQuery method arguments to conditionally wrap or unwrap event
 * handlers based on the provided strategy.
 * @internal
 */
function patchArguments(
  args: unknown[],
  mapProcessor: (
    map: Record<string, JQueryEventHandler | undefined>
  ) => Record<string, JQueryEventHandler | undefined>,
  handlerProcessor: (eventHandler: EventHandler) => EventHandler
) {
  const firstArgument = args[0];
  if (firstArgument && typeof firstArgument === 'object') {
    args[0] = mapProcessor(firstArgument as Record<string, JQueryEventHandler | undefined>);
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
 * Logic: Core jQuery Patch Orchestration
 * Enables global patches for jQuery to integrate reactive state management.
 *
 * Logic: Strategy
 * - Events: Wraps handlers in `batch()` to coalesce state updates.
 * - Lifecycle: Hooks into DOM removal to trigger reactive resource cleanup.
 *
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
  const originalMethods = originals;

  if (lifecycle) {
    $.fn.remove = function (this: JQuery, selector?: string) {
      const targets = selector ? this.filter(selector) : this;
      for (const element of targets) {
        if (element) {
          registry.markIgnored(element);
          registry.cleanupTree(element);
        }
      }
      return originalMethods.remove.call(this, selector);
    };

    $.fn.empty = function (this: JQuery) {
      for (const element of this) {
        if (element?.hasChildNodes()) {
          registry.cleanupDescendants(element);
        }
      }
      return originalMethods.empty.call(this);
    };

    $.fn.detach = function (this: JQuery, selector?: string) {
      const targets = selector ? this.filter(selector) : this;
      for (const element of targets) {
        if (element) {
          registry.keep(element);
        }
      }
      return originalMethods.detach.call(this, selector);
    };
  }

  if (events) {
    $.fn.on = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, wrapEventMap, wrapHandler);
      return originalMethods.on.apply(this, args as Parameters<typeof $.fn.on>);
    };

    $.fn.one = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, wrapEventMap, wrapHandler);
      return originalMethods.one.apply(this, args as Parameters<typeof $.fn.one>);
    };

    $.fn.off = function (this: JQuery, ...args: unknown[]) {
      patchArguments(args, unwrapEventMap, unwrapHandler);
      return originalMethods.off.apply(this, args as Parameters<typeof $.fn.off>);
    };
  }
}

/**
 * Logic: Patch Restoration
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
