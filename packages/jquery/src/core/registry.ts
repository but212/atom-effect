import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { EffectObject } from '@/types';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';

let autoCleanupScheduled = false;

/**
 * Optimization: Elements with active bindings are marked with this class.
 * This allows cleanupDescendants to perform a high-performance scoped query
 * (getElementsByClassName) instead of a slow, full-tree recursive walk.
 */
const AES_BOUND = '_aes-bound';

export interface BindingRecord {
  cleanups?: Array<() => void>;
  componentCleanup?: (() => void) | undefined;
}

/**
 * Manages the lifecycle of reactive bindings and component effects.
 *
 * Safety Rationale:
 * - Uses WeakMap for records to avoid holding strong references that prevent GC.
 * - Uses WeakSet for node flags (kept/ignored) to ensure the registry doesn't leak
 *   memory even for nodes that were "lost" without a cleanup call.
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

  private getOrCreateRecord(el: Element): BindingRecord {
    // Lazy-init: The mutation observer only starts when the first binding is created.
    if (!autoCleanupScheduled && typeof document !== 'undefined' && document.body) {
      autoCleanupScheduled = true;
      enableAutoCleanup(document.body);
    }
    let res = this.records.get(el);
    if (!res) {
      res = {};
      this.records.set(el, res);
      el.classList.add(AES_BOUND);
    }
    return res;
  }

  private addCleanup(el: Element, fn: () => void): void {
    const record = this.getOrCreateRecord(el);
    if (!record.cleanups) record.cleanups = [];
    record.cleanups.push(fn);
  }

  /** Registers a reactive effect instance to be disposed when the element is removed. */
  trackEffect(el: Element, fx: EffectObject): void {
    const selector = getSelector(el);
    this.addCleanup(el, () => {
      try {
        fx.dispose();
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR(selector), e);
      }
    });
  }

  /** Registers a generic cleanup closure to be executed when the element is removed. */
  trackCleanup(el: Element, fn: () => void): void {
    const selector = getSelector(el);
    this.addCleanup(el, () => {
      try {
        fn();
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.CLEANUP_ERROR(selector), e);
      }
    });
  }

  /** Sets the optional teardown function returned by a mounted component. */
  setComponentCleanup(el: Element, fn: (() => void) | undefined): void {
    this.getOrCreateRecord(el).componentCleanup = fn;
  }

  hasBind(el: Element): boolean {
    return this.records.has(el);
  }

  /**
   * Performs the actual destruction of all resources bound to the node.
   * This clears the record, removes the tracking CSS class, and executes all callbacks.
   */
  cleanup(el: Node): void {
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);

    if (el.nodeType !== 1) return;
    const element = el as Element;
    const record = this.records.get(element);

    this.records.delete(element);
    element.classList.remove(AES_BOUND);

    if (!record) return;

    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (e) {
        const selector = getSelector(element);
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.CLEANUP_ERROR(selector), e);
      }
    }

    if (record.cleanups) {
      for (const fn of record.cleanups) fn();
    }
  }

  /** Rapidly cleans up all child elements that have active reactive bindings. */
  cleanupDescendants(el: Element | DocumentFragment | ShadowRoot): void {
    // Logic: Scopes the cleanup to only elements marked with AES_BOUND for performance.
    const nodes =
      'getElementsByClassName' in el
        ? (el as Element).getElementsByClassName(AES_BOUND)
        : el.querySelectorAll(`.${AES_BOUND}`);

    for (let i = nodes.length - 1; i >= 0; i--) {
      this.cleanup(nodes[i]!);
    }
  }

  /** Destroys the reactive state of the element and its entire sub-tree. */
  cleanupTree(el: Node): void {
    if (el.nodeType === 1 || el.nodeType === 11) {
      this.cleanupDescendants(el as Element | DocumentFragment | ShadowRoot);
    }
    this.cleanup(el);
  }
}

export const registry = new BindingRegistry();

const observers = new Map<Node, MutationObserver>();

/**
 * Requirement: Native browser operations (like el.innerHTML = '') bypass jQuery hooks.
 * This observer serves as a safety net, detecting removed nodes that missed the
 * patched jQuery .remove() or .empty() calls.
 */
export function enableAutoCleanup(root: Element | ShadowRoot | DocumentFragment): void {
  if (observers.has(root)) return;

  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const removedNodes = mutations[i]!.removedNodes;
      for (let j = 0, rLen = removedNodes.length; j < rLen; j++) {
        const node = removedNodes[j]!;

        // Condition: We only clean up nodes that are genuinely disconnected from the DOM
        // AND are not marked for preservation.
        if (node.nodeType !== 1 || (node as Element).isConnected) continue;

        const el = node as Element;

        if (registry.isKept(el) || registry.isIgnored(el)) continue;

        registry.cleanupTree(el);
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
  observers.forEach((obs) => obs.disconnect());
  observers.clear();
}
