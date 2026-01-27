import { batch } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from './registry';

/** Generic event handler type matching jQuery's internal handler signature */
type EventHandler = JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;

/**
 * WeakMap to store strict association between original handlers and batched wrappers.
 * This ensures that .off() works correctly when passing the original handler.
 */
const handlerMap = new WeakMap<EventHandler, EventHandler>();

let isjQueryOverridesEnabled = false;

const getWrappedHandler = (fn: EventHandler): EventHandler => {
  let wrapped = handlerMap.get(fn);
  if (!wrapped) {
    wrapped = function (this: unknown, ...args: unknown[]) {
      return batch(() => fn.apply(this, args as Parameters<EventHandler>));
    } as unknown as EventHandler;
    handlerMap.set(fn, wrapped);
  }
  return wrapped;
};

/**
 * Patches jQuery methods to integrate with the reactive system.
 */
export function enablejQueryOverrides() {
  if (isjQueryOverridesEnabled) return;
  isjQueryOverridesEnabled = true;

  const originalOn = $.fn.on;
  const originalOff = $.fn.off;
  const originalRemove = $.fn.remove;
  const originalEmpty = $.fn.empty;
  const originalDetach = $.fn.detach;

  // ========== Lifecycle Overrides ==========

  // .remove() - Delete element + Unsubscribe
  $.fn.remove = function (this: JQuery, selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    for (let i = 0, len = targets.length; i < len; i++) {
      const el = targets[i];
      if (el) {
        registry.cleanupTree(el);
        registry.markIgnored(el);
      }
    }
    return originalRemove.call(this, selector);
  };

  // .empty() - Delete children + Recursive Unsubscribe
  $.fn.empty = function (this: JQuery) {
    for (let i = 0, len = this.length; i < len; i++) {
      const el = this[i];
      if (el) registry.cleanupDescendants(el);
    }
    return originalEmpty.call(this);
  };

  // .detach() - Remove from DOM + Keep Subscription
  $.fn.detach = function (this: JQuery, selector?: string) {
    const targets = selector ? this.filter(selector) : this;
    for (let i = 0, len = targets.length; i < len; i++) {
      const el = targets[i];
      if (el) registry.keep(el);
    }
    return originalDetach.call(this, selector);
  };

  // ========== Event Overrides ==========

  // Patch .on()
  $.fn.on = function (this: JQuery, ...args: unknown[]) {
    const types = args[0];

    if (types && typeof types === 'object') {
      const map = types as Record<string, EventHandler>;
      const newMap: Record<string, EventHandler> = {};
      for (const key in map) {
        const handler = map[key];
        if (handler) {
          newMap[key] = getWrappedHandler(handler);
        }
      }
      args[0] = newMap;
    } else {
      for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === 'function') {
          args[i] = getWrappedHandler(args[i] as EventHandler);
          break;
        }
      }
    }

    return originalOn.apply(this, args as Parameters<typeof originalOn>);
  };

  // Patch .off()
  $.fn.off = function (this: JQuery, ...args: unknown[]) {
    const types = args[0];

    if (types && typeof types === 'object') {
      const map = types as Record<string, EventHandler>;
      const newMap: Record<string, EventHandler> = {};
      for (const key in map) {
        const handler = map[key];
        if (handler) {
          newMap[key] = handlerMap.get(handler) || handler;
        }
      }
      args[0] = newMap;
    } else {
      for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === 'function') {
          args[i] = handlerMap.get(args[i] as EventHandler) || args[i];
          break;
        }
      }
    }

    return originalOff.apply(this, args as Parameters<typeof originalOff>);
  };
}

/**
 * @deprecated use `enablejQueryOverrides()` instead.
 * This alias will be removed in the future.
 */
export const enablejQueryBatching = enablejQueryOverrides;
