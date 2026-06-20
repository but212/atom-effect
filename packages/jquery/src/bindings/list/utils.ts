/**
 * @module List Utilities
 *
 * Responsibility:
 * Provides low-level DOM manipulation and cleanup helpers specialized for
 * the reactive list reconciliation engine.
 *
 * Design Intent:
 * Abstracts away differences between raw DOM nodes and jQuery collections
 * while enforcing strict memory management and identity tracking via 'data-atom-key'.
 */

import { registry } from '@/core/registry';

/**
 * Role: DOM Identity Tracking
 * Assigns or removes a stable reactive identifier on a DOM node.
 *
 * @param $el - The target jQuery collection.
 * @param key - Unique string key for identification, or null to remove.
 * @internal
 */
export function setAtomKey(nodes: Node[], key: string | null): void {
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el instanceof Element) {
      if (key === null) {
        el.removeAttribute('data-atom-key');
      } else {
        el.setAttribute('data-atom-key', key);
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
 * @param nodes - The root nodes to purge from the registry.
 * @internal
 */
export function cleanupNodes(nodes: Node[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el) registry.cleanupTree(el);
  }
}

/**
 * Escapes special HTML characters to prevent attribute breakout.
 */
export function escapeHtmlAttr(attributeValue: string): string {
  return attributeValue
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const HTML_TAG_START_REGEXP = /^\s*<([a-zA-Z][^\s/>]*)/;

/**
 * Injects 'data-atom-key' attribute directly into an HTML string's root element.
 */
export function injectKeyToHtml(html: string, key: string): string {
  const match = html.match(HTML_TAG_START_REGEXP);
  if (!match) return html;

  const insertIndex = match[0].length;
  const escapedKey = escapeHtmlAttr(key);
  return `${html.slice(0, insertIndex)} data-atom-key="${escapedKey}"${html.slice(insertIndex)}`;
}

/**
 * Swaps old DOM nodes with new DOM nodes in place and cleans up reactive resources.
 */
export function replaceDomNodes(oldNodes: Node[], newNodes: Node[]): void {
  cleanupNodes(oldNodes);
  const firstPreviousNode = oldNodes[0];
  if (firstPreviousNode?.parentNode) {
    const parent = firstPreviousNode.parentNode;
    for (let i = 0; i < newNodes.length; i++) {
      const el = newNodes[i];
      if (el) parent.insertBefore(el, firstPreviousNode);
    }
    for (let i = 0; i < oldNodes.length; i++) {
      const el = oldNodes[i];
      if (el?.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  }
}
