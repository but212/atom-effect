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
export function setAtomKey($el: JQuery, key: string | null): void {
  key === null ? $el.removeAttr('data-atom-key') : $el.attr('data-atom-key', key);
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
 * @param $el - The root collection to purge from the registry.
 * @internal
 */
export function cleanupNodes($el: JQuery): void {
  for (let i = 0; i < $el.length; i++) {
    if ($el[i]) registry.cleanupTree($el[i]!);
  }
}
