import $ from 'jquery';
import { registry } from '@/core/registry';

/**
 * Normalizes a raw DOM element or a jQuery collection into a standard jQuery object.
 *
 * @param $el - The element or collection to normalize.
 * @returns A standard jQuery object.
 * @internal
 */
export function wrap($el: Element | JQuery<Element>): JQuery {
  return ($el instanceof Element ? $($el) : $el) as unknown as JQuery;
}

/**
 * Assigns or removes a stable reactive identifier on a DOM node or collection.
 *
 * Logic: The `data-atom-key` attribute serves as the primary stable identifier
 * for DOM nodes within the list reconciliation engine. This allows the diffing
 * algorithm to perform O(N) re-ordering and node reuse, avoiding the overhead
 * of positional comparisons.
 *
 * @param node - The DOM element, Node, or jQuery collection.
 * @param key - The unique string key to assign, or null to remove the identifier.
 * @internal
 */
export function setAtomKey(node: Element | Node | JQuery, key: string | null): void {
  if (node instanceof Element) {
    if (key === null) {
      node.removeAttribute('data-atom-key');
    } else {
      node.setAttribute('data-atom-key', key);
    }
  } else if (!(node as Node).nodeType) {
    Array.from(node as JQuery).forEach((el) => {
      if (el instanceof Element) {
        if (key === null) {
          el.removeAttribute('data-atom-key');
        } else {
          el.setAttribute('data-atom-key', key);
        }
      }
    });
  }
}

/**
 * Performs a deep recursive cleanup of reactive resources associated with a DOM tree.
 *
 * Caution: This method must be executed before an element is permanently detached
 * from the DOM or replaced. Failure to do so may result in "zombie" reactive
 * effects remaining in the registry, leading to significant memory leaks.
 *
 * @param node - The root element or jQuery collection to clean up.
 * @internal
 */
export function cleanupNodes(node: Element | JQuery): void {
  if (node instanceof Element) {
    registry.cleanupTree(node);
  } else {
    Array.from(node as JQuery).forEach((el) => {
      if (el instanceof Element) {
        registry.cleanupTree(el);
      }
    });
  }
}
