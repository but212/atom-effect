/**
 * @module AEJDomUtils
 *
 * Responsibility:
 * Provides low-level DOM utilities for jQuery collections and binding
 * source normalization. Ensures type-safe element iteration and
 * consistent handling of overloaded binding signatures.
 */

/**
 * Logic: Element-Only Iteration
 *
 * Reason: jQuery collections can contain non-element nodes (e.g., text or
 * comment nodes) which are incompatible with reactive binding logic.
 * This utility ensures a safe execution path for DOM-specific operations.
 *
 * @internal
 */
export function atomEachElement(jq: JQuery, fn: (el: HTMLElement) => void): JQuery {
  for (const node of jq) {
    if (node.nodeType === Node.ELEMENT_NODE) fn(node as HTMLElement);
  }
  return jq;
}

/**
 * Logic: Overload Normalization Heuristics
 * Normalizes a binding source into a tuple containing the source and optional config.
 *
 * Logic: Heuristics
 * Determines if an input represents a configuration tuple (e.g., `[source, options]`)
 * or a simple array-based data value. Supports unified binding overloads.
 *
 * @internal
 */
export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (!Array.isArray(val) || val.length !== 2) {
    return [val as T];
  }

  const second = val[1];
  if (second === null || second === undefined) {
    return [val as T];
  }

  // Logic: Check if the second element qualifies as a configuration object or function.
  const isTuple =
    typeof second === 'function' ||
    (typeof second === 'object' && !('value' in second) && !('then' in second));

  return isTuple ? (val as [T, O]) : ([val as T] as [T, O?]);
}
