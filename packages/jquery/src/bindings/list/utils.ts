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
    if (el && el.nodeType === 1) {
      const element = el as HTMLElement;
      if (key === null) {
        element.removeAttribute('data-atom-key');
      } else {
        element.setAttribute('data-atom-key', key);
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
