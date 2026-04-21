import $ from 'jquery';
import { registry } from '@/core/registry';

/**
 * Normalizes an Element or a jQuery collection into a standard jQuery object.
 *
 * @internal
 */
export function wrap($el: Element | JQuery<Element>): JQuery {
  return ($el instanceof Element ? $($el) : $el) as unknown as JQuery;
}

/**
 * Manages the `data-atom-key` attribute used for list reconciliation.
 *
 * Logic: This attribute serves as the primary stable identifier for DOM nodes,
 * allowing the diffing algorithm to perform O(N) re-ordering and reuse
 * instead of expensive O(N^2) positional checks.
 *
 * @internal
 */
export function setAtomKey(node: Element | Node | JQuery, key: string | null): void {
  if (node instanceof Element) {
    if (key === null) node.removeAttribute('data-atom-key');
    else node.setAttribute('data-atom-key', key);
  } else if (!(node as Node).nodeType) {
    // Handling jQuery collections
    const elOrJq = node as JQuery;
    for (let i = 0, len = elOrJq.length; i < len; i++) {
      const el = elOrJq[i];
      if (el instanceof Element) {
        if (key === null) el.removeAttribute('data-atom-key');
        else el.setAttribute('data-atom-key', key);
      }
    }
  }
}

/**
 * Triggers the mandatory teardown for reactive bindings associated with target nodes.
 *
 * Caution:
 * This must be executed before an element is permanently detached from the DOM
 * or replaced. Failing to do so creates "zombie" reactive effects in the
 * global registry, leading to severe memory leaks.
 *
 * @internal
 */
export function cleanupNodes(node: Element | JQuery): void {
  if (node instanceof Element) {
    registry.cleanupTree(node);
  } else {
    for (let j = 0, nLen = (node as JQuery).length; j < nLen; j++) {
      const el = (node as JQuery)[j];
      if (el instanceof Element) registry.cleanupTree(el);
    }
  }
}
