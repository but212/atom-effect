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
const AES_HAS_SHADOW = '_aes-has-shadow';

export interface BindingRecord {
  cleanups?: Array<() => void>;
  componentCleanup?: (() => void) | undefined;
}

/**
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

  private closedShadows = new WeakMap<Element, ShadowRoot>();

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

  /**
   * Internal: Removes the 'ignored' flag to re-enable automatic cleanup.
   * @internal
   */
  unmarkIgnored(node: Node): void {
    this.ignoredNodes.delete(node);
  }

  /**
   * Performs a move-aware cleanup of a node and its descendants.
   *
   * Logic: Deferring cleanup to the next microtask allows elements to be
   * moved (disconnected then reconnected) without losing their reactive state.
   *
   * @param node - The node to tentatively clean up.
   */
  deferredCleanup(node: Node): void {
    this.ignoredNodes.add(node);
    queueMicrotask(() => {
      if (node.isConnected) {
        this.ignoredNodes.delete(node);
      } else {
        this.cleanupTree(node);
      }
    });
  }

  /**
   * Registers a ShadowRoot to a host element for AEJ lifecycle tracking.
   *
   * @example
   * const sr = host.attachShadow({ mode: 'closed' });
   * registry.registerShadow(host, sr);
   *
   * @internal
   */
  registerShadow(host: Element, sr: ShadowRoot): void {
    this.closedShadows.set(host, sr);
  }

  /**
   * Marks a host element to indicate it has a managed ShadowRoot.
   *
   * Optimization: This adds a CSS class used by `cleanupDescendants` to avoid
   * expensive full-tree traversal (`querySelectorAll('*')`).
   *
   * Constraint: Must be called after the element is upgraded or connected to
   * avoid violation of Custom Element constructor rules.
   *
   * @internal
   */
  markHost(host: Element): void {
    host.classList.add(AES_HAS_SHADOW);
  }

  /**
   * Retrieves the ShadowRoot for a host, including tracked 'closed' roots.
   * @internal
   */
  getShadow(host: Element): ShadowRoot | null {
    return host.shadowRoot || this.closedShadows.get(host) || null;
  }

  private getOrCreateRecord(element: Element): BindingRecord {
    // Logic: Lazy-init the mutation observer only when the first binding is created.
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

  /**
   * Core tracking for reactive effects.
   *
   * Constraint: Effects must be tracked to ensure synchronous disposal
   * when the host element is removed from the DOM.
   */
  trackEffect(element: Element, effect: EffectObject): void {
    const selector = getSelector(element);
    this.addCleanup(element, () => {
      try {
        effect.dispose();
      } catch (error) {
        debug.error(
          LOG_PREFIXES.BINDING,
          ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR(selector),
          error
        );
      }
    });
  }

  /** @internal */
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

  /** @internal */
  setComponentCleanup(element: Element, teardownFunction: (() => void) | undefined): void {
    this.getOrCreateRecord(element).componentCleanup = teardownFunction;
  }

  hasBind(element: Element): boolean {
    return this.records.has(element);
  }

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
   * Logic: Snapshot Strategy
   * Uses `querySelectorAll` to obtain a static `NodeList` snapshot before
   * starting the iteration. This ensures loop stability by preventing
   * index shifting or missing nodes if elements are removed or their
   * classes are modified during the cleanup cycle.
   */
  cleanupDescendants(root: Element | DocumentFragment | ShadowRoot): void {
    const nodes = root.querySelectorAll(`.${AES_BOUND}`);

    // Reason: Scoped cleanup prevents memory leaks in reactive bindings.
    for (let i = 0, length = nodes.length; i < length; i++) {
      const node = nodes[i];
      if (node) this.cleanup(node);
    }

    // Logic: Marker-based traversal (Data Dominates).
    // Optimization: Instead of walking the whole tree with `*`, we jump to
    // elements known to have shadow roots. This keeps cleanup O(N_bound + N_hosts).
    const shadowHosts = root.querySelectorAll(`.${AES_HAS_SHADOW}`);
    for (let i = 0, length = shadowHosts.length; i < length; i++) {
      const el = shadowHosts[i] as Element;
      const sr = this.getShadow(el);
      if (sr) this.cleanupTree(sr);
    }
  }

  /**
   * Performs a deep recursive cleanup on a node and its entire Shadow DOM subtrees.
   * @internal
   */
  cleanupTree(node: Node): void {
    if (node.nodeType === 1 || node.nodeType === 11) {
      const root = node as Element | DocumentFragment | ShadowRoot;
      this.cleanupDescendants(root);

      // Logic: Shadow DOM Recursion (Root level).
      // Constraint: Recursive call is necessary because shadow roots are isolated from querySelectorAll.
      if (node.nodeType === 1) {
        const sr = this.getShadow(node as Element);
        if (sr) this.cleanupTree(sr);
      }
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

/**
 * Disconnects and removes the MutationObserver registered for a specific root node.
 *
 * Logic: Component-scoped cleanup.
 * Unlike `disableAutoCleanup` (which clears all observers globally), this
 * targets a single boundary. Used by `useAtomComponent.teardown()` to release
 * the strong reference the `observers` Map holds to ShadowRoot nodes,
 * preventing memory leaks on permanent component removal.
 *
 * @internal
 */
export function disableAutoCleanupFor(root: Node): void {
  const observer = observers.get(root);
  if (observer) {
    observer.disconnect();
    observers.delete(root);
  }
}
