import $ from 'jquery';
import { registry } from '@/core/registry';

/**
 * Normalizes a raw DOM element or a jQuery collection into a standard jQuery object.
 *
 * Logic: Polymorphic Input
 * Supports both raw Element for single operations and JQuery collections for bulk
 * processing, ensuring consistent API behavior.
 *
 * @internal
 */
export function wrap($el: Element | JQuery<Element>): JQuery {
  // nodeType check is slightly faster than instanceof Element in hot paths.
  return ('nodeType' in $el && $el.nodeType === 1 ? $($el) : $el) as unknown as JQuery;
}

/**
 * Assigns or removes a stable reactive identifier on a DOM node or collection.
 *
 * @param node - The target DOM element or collection.
 * @param key - Unique string key for identification, or null to remove.
 * @internal
 */
export function setAtomKey(node: Element | Node | JQuery, key: string | null): void {
  if (!node) return;
  const ATTR = 'data-atom-key';

  if ('nodeType' in node) {
    if (node.nodeType === 1) {
      const el = node as Element;
      if (key === null) {
        el.removeAttribute(ATTR);
      } else if (el.getAttribute(ATTR) !== key) {
        el.setAttribute(ATTR, key);
      }
    }
    return;
  }

  const col = node as unknown as ArrayLike<Node>;
  const len = col.length | 0;
  if (key === null) {
    for (let i = 0; i < len; i++) {
      const n = col[i];
      if (n && n.nodeType === 1) (n as Element).removeAttribute(ATTR);
    }
  } else {
    for (let i = 0; i < len; i++) {
      const n = col[i];
      if (n && n.nodeType === 1) {
        const el = n as Element;
        if (el.getAttribute(ATTR) !== key) el.setAttribute(ATTR, key);
      }
    }
  }
}

/**
 * Performs a deep recursive cleanup of reactive resources associated with a DOM tree.
 *
 * Constraint: Teardown Order
 * Must be executed before an element is permanently detached or replaced.
 *
 * Caution: Memory Leak
 * Failure to call this results in "zombie" reactive effects remaining in the
 * global registry, leading to significant memory growth over time.
 *
 * @param node - The root element or collection to purge from the registry.
 * @internal
 */
export function cleanupNodes(node: Element | JQuery): void {
  if (!node) return;

  if ('nodeType' in node) {
    if (node.nodeType === 1) registry.cleanupTree(node as Element);
    return;
  }

  const col = node as unknown as ArrayLike<Node>;
  const len = col.length | 0;
  for (let i = 0; i < len; i++) {
    const n = col[i];
    if (n && n.nodeType === 1) registry.cleanupTree(n as Element);
  }
}
