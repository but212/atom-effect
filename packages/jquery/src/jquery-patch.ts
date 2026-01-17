import $ from 'jquery';
import { batch } from '@but212/atom-effect';
import { registry } from './registry';

/**
 * WeakMap to store strict association between original handlers and batched wrappers.
 * This ensures that .off() works correctly when passing the original handler.
 */
const handlerMap = new WeakMap<Function, Function>();

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
    });

    return originalRemove.call(this, selector);
  };

  // .empty() - Delete children + Recursive Unsubscribe
  $.fn.empty = function () {
    this.each(function () {
      const children = this.querySelectorAll('*');
      children.forEach(child => registry.cleanup(child));
      // Note: cleanupTree(this) would unsubscribe the element itself, which is incorrect for .empty().
      // We must clean up all descendants. `querySelectorAll('*')` achieves this.
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
  // biome-ignore lint/suspicious/noExplicitAny: jQuery dynamic args
  $.fn.on = function (this: any, ...args: any[]) {
    let fnIndex = -1;
    for (let i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === 'function') {
        fnIndex = i;
        break;
      }
    }

    if (fnIndex !== -1) {
      const originalFn = args[fnIndex];
      
      let wrappedFn: Function | undefined;
      if (handlerMap.has(originalFn)) {
        wrappedFn = handlerMap.get(originalFn);
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: internal this
        wrappedFn = function (this: any, ...eventArgs: any[]) {
          // biome-ignore lint/suspicious/noExplicitAny: return value
          let result: any;
          batch(() => {
            result = originalFn.apply(this, eventArgs);
          });
          return result;
        };
        handlerMap.set(originalFn, wrappedFn);
      }

      args[fnIndex] = wrappedFn;
    }

    // biome-ignore lint/suspicious/noExplicitAny: dynamic args
    return originalOn.apply(this, args as any);
  };

  // Patch .off()
  // biome-ignore lint/suspicious/noExplicitAny: jQuery dynamic args
  $.fn.off = function (this: any, ...args: any[]) {
    let fnIndex = -1;
    for (let i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === 'function') {
        fnIndex = i;
        break;
      }
    }

    if (fnIndex !== -1) {
      const originalFn = args[fnIndex];
      if (handlerMap.has(originalFn)) {
        args[fnIndex] = handlerMap.get(originalFn);
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: dynamic args
    return originalOff.apply(this, args as any);
  };
}

// Alias for backward compatibility if needed, though we are refactoring.
export const enablejQueryBatching = enablejQueryOverrides;
