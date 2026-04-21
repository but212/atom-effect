import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { EffectObject } from '@/types';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';

let autoCleanupScheduled = false;

/**
 * Optimization: Marker class for elements with active reactive bindings.
 * This allows `cleanupDescendants` to perform a high-performance scoped query
 * (`querySelectorAll`) instead of a computationally expensive, full-tree recursive walk.
 *
 * @internal
 */
const AES_BOUND = '_aes-bound';

export interface BindingRecord {
  cleanups?: Array<() => void>;
  componentCleanup?: (() => void) | undefined;
}

/**
 * Manages the lifecycle of reactive bindings and component effects.
 *
 * Logic: Safety & Memory Management
 * - WeakMap Storage: Records are stored using `WeakMap` to avoid strong
 *   references, allowing the garbage collector to reclaim memory from
 *   elements even if they weren't explicitly unmounted.
 * - Flag System: Uses `WeakSet` for `keep`/`ignored` states to ensure
 *   tracking metadata doesn't leak memory for nodes that were "lost"
 *   without a cleanup call.
 *
 * @internal
 */
class BindingRegistry {
  private records = new WeakMap<Element, BindingRecord>();

  private preservedNodes = new WeakSet<Node>();

  private ignoredNodes = new WeakSet<Node>();

  /** Mark a node to preserve its effects even if detached from the DOM (e.g., jQuery .detach()). */
  keep(node: Node): void {
    this.preservedNodes.add(node);
  }

  isKept(node: Node): boolean {
    return this.preservedNodes.has(node);
  }

  /** Temporary flag to block redundant cleanup cycles for the same node. */
  markIgnored(node: Node): void {
    this.ignoredNodes.add(node);
  }

  isIgnored(node: Node): boolean {
    return this.ignoredNodes.has(node);
  }

  private getOrCreateRecord(element: Element): BindingRecord {
    // Lazy-init: The mutation observer only starts when the first binding is created.
    if (!autoCleanupScheduled && typeof document !== 'undefined' && document.body) {
      autoCleanupScheduled = true;
      enableAutoCleanup(document.body);
    }
    let result = this.records.get(element);
    if (!result) {
      result = {};
      this.records.set(element, result);
      element.classList.add(AES_BOUND);
    }
    return result;
  }

  private addCleanup(element: Element, cleanupFunction: () => void): void {
    const record = this.getOrCreateRecord(element);
    if (!record.cleanups) record.cleanups = [];
    record.cleanups.push(cleanupFunction);
  }

  /** Registers a reactive effect instance to be disposed when the element is removed. */
  trackEffect(element: Element, reactiveEffect: EffectObject): void {
    const selector = getSelector(element);
    this.addCleanup(element, () => {
      try {
        reactiveEffect.dispose();
      } catch (error) {
        debug.error(
          LOG_PREFIXES.BINDING,
          ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR(selector),
          error
        );
      }
    });
  }

  /** Registers a generic cleanup closure to be executed when the element is removed. */
  trackCleanup(element: Element, cleanupFunction: () => void): void {
    const selector = getSelector(element);
    this.addCleanup(element, () => {
      try {
        cleanupFunction();
      } catch (error) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.CLEANUP_ERROR(selector), error);
      }
    });
  }

  /** Sets the optional teardown function returned by a mounted component. */
  setComponentCleanup(element: Element, teardownFunction: (() => void) | undefined): void {
    this.getOrCreateRecord(element).componentCleanup = teardownFunction;
  }

  hasBind(element: Element): boolean {
    return this.records.has(element);
  }

  /**
   * Performs the actual destruction of all resources bound to the node.
   * This clears the record, removes the tracking CSS class, and executes all callbacks.
   */
  cleanup(node: Node): void {
    this.preservedNodes.delete(node);
    this.ignoredNodes.delete(node);

    if (node.nodeType !== 1) return;
    const element = node as Element;
    const record = this.records.get(element);

    this.records.delete(element);
    element.classList.remove(AES_BOUND);

    if (!record) return;

    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (error) {
        const selector = getSelector(element);
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.CLEANUP_ERROR(selector), error);
      }
    }

    if (record.cleanups) {
      for (const cleanupFunction of record.cleanups) cleanupFunction();
    }
  }

  /**
   * Cleans up all bound reactive state for descendant nodes.
   *
   * Logic: Snapshot Strategy
   * Uses `querySelectorAll` to obtain a static `NodeList` snapshot before
   * starting the iteration. This ensures loop stability by preventing
   * index shifting or missing nodes if elements are removed or their
   * classes are modified during the cleanup cycle.
   */
  cleanupDescendants(root: Element | DocumentFragment | ShadowRoot): void {
    const nodes = root.querySelectorAll(`.${AES_BOUND}`);

    for (let i = 0, length = nodes.length; i < length; i++) {
      const node = nodes[i];
      if (node) this.cleanup(node);
    }
  }

  /** Destroys the reactive state of the element and its entire sub-tree. */
  cleanupTree(node: Node): void {
    if (node.nodeType === 1 || node.nodeType === 11) {
      this.cleanupDescendants(node as Element | DocumentFragment | ShadowRoot);
    }
    this.cleanup(node);
  }
}

export const registry = new BindingRegistry();

const observers = new Map<Node, MutationObserver>();

/**
 * Logic: DOM Safety Net
 * Native browser operations (e.g., `el.innerHTML = ''`) bypass jQuery hooks.
 * This observer acts as a fallback system, detecting removed nodes that
 * were not processed by patched jQuery methods like `.remove()` or `.empty()`.
 *
 * @internal
 */
export function enableAutoCleanup(root: Element | ShadowRoot | DocumentFragment): void {
  if (observers.has(root)) return;

  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mutationsLength = mutations.length; i < mutationsLength; i++) {
      const removedNodes = mutations[i]!.removedNodes;
      for (let j = 0, removedNodesLength = removedNodes.length; j < removedNodesLength; j++) {
        const node = removedNodes[j]!;

        // Condition: We only clean up nodes that are genuinely disconnected from the DOM
        // AND are not marked for preservation.
        if (node.nodeType !== 1 || (node as Element).isConnected) continue;

        const element = node as Element;

        if (registry.isKept(element) || registry.isIgnored(element)) continue;

        registry.cleanupTree(element);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  observers.set(root, observer);
}

export function setAutoCleanupScheduled(scheduled: boolean): void {
  autoCleanupScheduled = scheduled;
}

export function disableAutoCleanup(): void {
  observers.forEach((observer) => observer.disconnect());
  observers.clear();
}
