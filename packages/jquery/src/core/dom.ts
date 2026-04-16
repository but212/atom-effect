import { LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { BindingContext, EffectCleanup } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Shared DOMParser instance for efficient parsing across the package.
 */
export const SHARED_PARSER = new DOMParser();

/**
 * Creates a binding context for a DOM element.
 *
 * This context is passed to binding functions and provides:
 * 1. The target element (`el`).
 * 2. A `trackCleanup` helper to register any standard or reactive cleanups
 *    that should run when the element is removed from the DOM.
 *
 * @param el - The target HTMLElement to create a context for.
 * @returns A BindingContext instance for the element.
 */
export function createContext(el: HTMLElement): BindingContext {
  return {
    el,
    trackCleanup: (fn: EffectCleanup) => registry.trackCleanup(el, fn),
  };
}

/**
 * The central iteration engine for all chainable `atomXXX` methods.
 *
 * Processes a jQuery set and applies a binding function to each Element node.
 * It handles the `nodeType` filtering (skipping text/comment nodes) and
 * optionally provides a binding context if `needsCtx` is true.
 *
 * @param jq - The jQuery set to iterate over.
 * @param fn - The binding logic to apply to each element.
 * @param options - Configure whether a context is generated.
 * @param options.needsCtx - If true, passes a new BindingContext to the function.
 * @returns The original jQuery set for method chaining.
 */
export function atomEachElement(
  jq: JQuery,
  fn: (ctx: BindingContext | null, el: HTMLElement) => void,
  options: { needsCtx?: boolean } = {}
): JQuery {
  // Performance: Cache options lookup before entering the loop.
  const needsCtx = !!options.needsCtx;
  const len = jq.length;

  for (let i = 0; i < len; i++) {
    const node = jq[i];

    // Only Element nodes (nodeType 1) are valid targets for reactive bindings.
    if (node?.nodeType === 1) {
      const el = node as HTMLElement;
      fn(needsCtx ? createContext(el) : null, el);
    } else if (node) {
      debug.log(LOG_PREFIXES.BINDING, `Skipping non-Element node (nodeType=${node.nodeType})`);
    }
  }
  return jq;
}

/**
 * Utility to normalize `[source, options]` tuple or standalone `source` arguments.
 *
 * This is crucial for integrated bindings (like `atomBind`) that support
 * both shorthand values and detailed [value, options] pairs.
 *
 * @note The tuple detection is focused on the **second** element. If it looks
 * like an options object or a formatter function (and isn't reactive itself),
 * the input is treated as a tuple. This allows first-class support for static
 * constants or plain objects as binding sources.
 *
 * @param val - The raw value or tuple provided by the user.
 * @returns A normalized array where index 0 is always the source.
 */
export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (!Array.isArray(val) || val.length !== 2) {
    return [val as T];
  }

  const second = val[1];

  // Identifies a tuple if the second element:
  // 1. Is a function (usually a formatter: (v) => formattedValue).
  // 2. Is a plain object (excluding arrays, Atoms, and Promises).
  const isTuple =
    typeof second === 'function' ||
    (second !== null &&
      typeof second === 'object' &&
      !Array.isArray(second) &&
      !('value' in second) &&
      !('then' in second));

  return isTuple ? (val as [T, O]) : [val as T];
}
