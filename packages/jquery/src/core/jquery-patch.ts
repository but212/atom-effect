import { batch } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import type { PatchOptions } from '@/types';

type EventHandler = JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;

/**
 * Symbol used to mark handlers as processed, avoiding redundant wrapping in `batch()`.
 *
 * @internal
 */
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
 * Logic: Auto-Batching
 * This ensures that multiple atom updates triggered by a single event
 * (e.g., click) only trigger a single collective re-render, preventing
 * UI jitter and redundant calculations.
 *
 * @internal
 */
const wrapHandler = (fn: EventHandler): EventHandler => {
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

/**
 * @internal
 */
const unwrapHandler = (fn: EventHandler): EventHandler => {
  return handlerMap.get(fn) ?? fn;
};

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

function createPatch(original: Function) {
  return function (this: JQuery, ...args: unknown[]) {
    patchArguments(args, wrapEventMap, wrapHandler);
    return original.apply(this, args) ?? this;
  };
}

/**
 * Logic: Global Patch Responsibilities
 * 1. Event Patching: Wraps handlers in `batch()` to prevent UI jitter.
 * 2. Lifecycle Patching: Hooking `.remove()` to stop reactive effects immediately.
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
      return prev.remove.call(this, selector) ?? this;
    };

    $.fn.empty = function (this: JQuery) {
      const len = this.length;
      for (let i = 0; i < len; i++) {
        const el = this[i];
        if (el?.hasChildNodes()) registry.cleanupDescendants(el);
      }
      return prev.empty.call(this) ?? this;
    };

    $.fn.detach = function (this: JQuery, selector?: string) {
      const targets = selector ? this.filter(selector) : this;
      const len = targets.length;
      for (let i = 0; i < len; i++) {
        const el = targets[i];
        if (el) registry.keep(el);
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
