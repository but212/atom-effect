import { LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { BindingContext, EffectCleanup } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Creates a binding context for a DOM element.
 * Encapsulates the element and a helper to register cleanups.
 */
export function createContext(el: HTMLElement): BindingContext {
  return {
    el,
    trackCleanup: (fn: EffectCleanup) => registry.trackCleanup(el, fn),
  };
}

/**
 * Internal helper to iterate over a jQuery set and apply a binding function
 * to each Element node. Handles nodeType check and conditional context creation.
 *
 * This is the central engine for all chainable atomXXX methods.
 */
export function atomEachElement(
  jq: JQuery,
  fn: (ctx: BindingContext | null, el: HTMLElement) => void,
  options: { needsCtx?: boolean } = {}
): JQuery {
  for (let i = 0, len = jq.length; i < len; i++) {
    const node = jq[i];
    if (node?.nodeType === 1) {
      const el = node as HTMLElement;
      fn(options.needsCtx ? createContext(el) : null, el);
    } else if (node) {
      debug.log(LOG_PREFIXES.BINDING, `Skipping non-Element node (nodeType=${node.nodeType})`);
    }
  }
  return jq;
}

/**
 * Utility to handle [source, options] tuple arguments in integrated bindings.
 * Supports both standalone values and reactive atoms/promises.
 */
export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  return Array.isArray(val) &&
    val.length === 2 &&
    (typeof val[0] === 'function' ||
      (val[0] !== null &&
        typeof val[0] === 'object' &&
        ('value' in (val[0] as object) || 'then' in (val[0] as object))))
    ? (val as [T, O])
    : [val as T];
}
