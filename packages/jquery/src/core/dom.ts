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
export function atomEachElement(
  jqueryCollection: JQuery,
  callback: (element: HTMLElement) => void
): JQuery {
  for (const node of jqueryCollection) {
    if (node.nodeType === Node.ELEMENT_NODE) callback(node);
  }
  return jqueryCollection;
}
