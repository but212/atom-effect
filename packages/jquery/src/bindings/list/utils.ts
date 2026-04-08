import $ from 'jquery';
import { registry } from '@/core/registry';

/**
 * Ensures an element or jQuery collection is wrapped in a jQuery object.
 */
export function wrap($el: Node | JQuery<unknown>): JQuery {
  return ($el instanceof Node ? $($el) : $el) as unknown as JQuery;
}

/**
 * Sets or removes the 'data-atom-key' attribute on a DOM node or a jQuery collection.
 * This attribute is crucial for tracking which item an element belongs to.
 *
 * @param node - The DOM element, node, or jQuery object.
 * @param key - The key string to set, or null to remove it.
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
 * Cleans up the registry and effects associated with a tree of DOM nodes.
 *
 * @param node - The root element or a jQuery collection potentially containing multiple roots.
 */
export function cleanupNodes(node: Node | JQuery): void {
  if (node instanceof Element) {
    registry.cleanupTree(node);
  } else if ((node as JQuery).length !== undefined) {
    const jq = node as JQuery;
    for (let j = 0, nLen = jq.length; j < nLen; j++) {
      const el = jq[j];
      if (el instanceof Element) registry.cleanupTree(el);
    }
  }
}
