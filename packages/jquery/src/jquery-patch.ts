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

/**
 * Patches jQuery methods to integrate with the reactive system.
 *
 * 1. Lifecycle Overrides (.remove, .empty, .detach):
 *    - Automatically cleans up effects/bindings when elements are removed.
 *    - Preserves bindings when elements are detached.
 *
 * 2. Event Batching (.on, .off):
 *    - Wraps event handlers in batch() to optimize rendering.
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
  $.fn.remove = function (selector?: string) {
    // Filter elements if selector is provided, as per jQuery docs
    const $target = selector ? this.filter(selector) : this;

    $target.each(function () {
      registry.cleanupTree(this);
      registry.markIgnored(this); // Prevent double-cleanup by observer
    });

    return originalRemove.call(this, selector);
  };

  // .empty() - Delete children + Recursive Unsubscribe
  $.fn.empty = function () {
    this.each(function () {
      // Use optimized cleanupDescendants instead of expensive querySelectorAll('*')
      registry.cleanupDescendants(this);
    });

    return originalEmpty.call(this);
  };

  // .detach() - Remove from DOM + Keep Subscription (Marking)
  $.fn.detach = function (selector?: string) {
    const $target = selector ? this.filter(selector) : this;

    $target.each(function () {
      registry.keep(this);
    });

    return originalDetach.call(this, selector);
  };

  // ========== Event Overrides ==========

  // Patch .on()
  $.fn.on = function (this: JQuery, ...args: unknown[]) {
    let fnIndex = -1;
    for (let i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === 'function') {
        fnIndex = i;
        break;
      }
    }

    if (fnIndex !== -1) {
      const originalFn = args[fnIndex] as EventHandler;

      let wrappedFn: EventHandler | undefined;
      if (handlerMap.has(originalFn)) {
        wrappedFn = handlerMap.get(originalFn);
      } else {
        wrappedFn = function (this: unknown, event: JQuery.TriggeredEvent, ...eventArgs: unknown[]) {
          return batch(() => originalFn.call(this, event, ...eventArgs));
        };
        handlerMap.set(originalFn, wrappedFn);
      }

      args[fnIndex] = wrappedFn;
    }

    return originalOn.apply(this, args as Parameters<typeof originalOn>);
  };

  // Patch .off()
  $.fn.off = function (this: JQuery, ...args: unknown[]) {
    let fnIndex = -1;
    for (let i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === 'function') {
        fnIndex = i;
        break;
      }
    }

    if (fnIndex !== -1) {
      const originalFn = args[fnIndex] as EventHandler;
      if (handlerMap.has(originalFn)) {
        args[fnIndex] = handlerMap.get(originalFn);
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
