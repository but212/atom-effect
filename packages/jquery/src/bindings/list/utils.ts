/**
 * @module
 * Defines utility functions commonly used within list bindings.
 */
import $ from 'jquery';
import { registry } from '@/core/registry';

/**
 * Ensures an element or jQuery collection is wrapped in a jQuery object.
 */
export function wrap($el: Element | JQuery<Element>): JQuery {
  return ($el instanceof Element ? $($el) : $el) as unknown as JQuery;
}

/**
 * Sets or removes the 'data-atom-key' attribute on a DOM node or jQuery object.
 * This attribute is used to identify which data item an element corresponds to
 * during event delegation and reconciliation.
 *
 * @param node The target DOM element or jQuery object.
 * @param key The key string to set (or null to remove the attribute).
 */
export function setAtomKey(node: Element | Node | JQuery, key: string | null): void {
  if (node instanceof Element) {
    if (key === null) node.removeAttribute('data-atom-key');
    else node.setAttribute('data-atom-key', key);
  } else if (!(node as Node).nodeType) {
    // JQuery object
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
 * Executes and cleans up all registered effects and cleanup handlers
 * for the specified node and its entire subtree.
 * Should be called when a node is physically removed from the DOM to prevent memory leaks.
 *
 * @param node The root element or jQuery object to clean up.
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
