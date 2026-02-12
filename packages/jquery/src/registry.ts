import { debug } from './debug';
import type { EffectObject } from './types';
import { getSelector } from './utils';

/**
 * Marker class for bound elements to optimize selector engines.
 */
const AES_BOUND = '_aes-bound';

interface BindingRecord {
  effects?: EffectObject[];
  cleanups?: Array<() => void>;
}

/**
 * Binding Registry
 *
 * Highly optimized for performance:
 * - Uses WeakMap for zero-leak DOM associations.
 * - Minimal allocations in the tracking path.
 * - Efficient tree traversal for cleanup.
 */
class BindingRegistry {
  private records = new WeakMap<Element, BindingRecord>();
  private boundElements = new WeakSet<Element>();
  private preservedNodes = new WeakSet<Node>();
  private ignoredNodes = new WeakSet<Node>(); // Prevent redundant cleanup

  keep(node: Node): void {
    this.preservedNodes.add(node);
  }

  isKept(node: Node): boolean {
    return this.preservedNodes.has(node);
  }

  markIgnored(node: Node): void {
    this.ignoredNodes.add(node);
  }

  isIgnored(node: Node): boolean {
    return this.ignoredNodes.has(node);
  }

  private _getOrCreateRecord(el: Element): BindingRecord {
    let res = this.records.get(el);
    if (!res) {
      res = {};
      this.records.set(el, res);
      // Mark as bound and add class for faster querySelector lookup
      if (!this.boundElements.has(el)) {
        this.boundElements.add(el);
        el.classList.add(AES_BOUND);
      }
    }
    return res;
  }

  trackEffect(el: Element, fx: EffectObject): void {
    const record = this._getOrCreateRecord(el);
    (record.effects ??= []).push(fx);
  }

  trackCleanup(el: Element, fn: () => void): void {
    const record = this._getOrCreateRecord(el);
    (record.cleanups ??= []).push(fn);
  }

  hasBind(el: Element): boolean {
    return this.boundElements.has(el);
  }

  cleanup(el: Element): void {
    // Atomic delete return value used as a high-performance guard
    if (!this.boundElements.delete(el)) return;

    const record = this.records.get(el);
    if (!record) return;

    // Fast cleanup of metadata
    this.records.delete(el);
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);
    el.classList.remove(AES_BOUND);

    // Hoist costly selector string generation to debug-only block
    if (debug.enabled) {
      debug.cleanup(getSelector(el));
    }

    // 1. Dispose Effects (Atom -> Subscription severed)
    const effects = record.effects;
    if (effects) {
      for (let i = 0, len = effects.length; i < len; i++) {
        try {
          effects[i]?.dispose();
        } catch (e) {
          debug.warn('Effect dispose error:', e);
        }
      }
    }

    // 2. Execute custom cleanups
    const cleanups = record.cleanups;
    if (cleanups) {
      for (let i = 0, len = cleanups.length; i < len; i++) {
        try {
          cleanups[i]?.();
        } catch (e) {
          debug.warn('Cleanup error:', e);
        }
      }
    }
  }

  cleanupDescendants(el: Element): void {
    const children = el.querySelectorAll(`.${AES_BOUND}`);
    for (let i = 0, len = children.length; i < len; i++) {
      const child = children[i] as Element;
      // Double check because querySelectorAll might return disconnected leftovers
      if (child && this.boundElements.has(child)) {
        this.cleanup(child);
      } else if (child) {
        child.classList.remove(AES_BOUND);
      }
    }
  }

  cleanupTree(el: Element): void {
    this.cleanupDescendants(el);
    this.cleanup(el);
  }
}

export const registry = new BindingRegistry();

let observer: MutationObserver | null = null;

export function enableAutoCleanup(root: Element = document.body): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (let i = 0, len = mutations.length; i < len; i++) {
      const removedNodes = mutations[i]?.removedNodes;
      if (!removedNodes) continue;
      const rLen = removedNodes.length;
      if (rLen === 0) continue;

      for (let j = 0; j < rLen; j++) {
        const node = removedNodes[j]!;
        // Early exit: only elements can have AES_BOUND bindings
        if (node.nodeType !== 1) continue;

        // Skip if kept (detached for moves), explicitly ignored, or still connected
        if (node.isConnected || registry.isKept(node) || registry.isIgnored(node)) {
          continue;
        }

        registry.cleanupTree(node as Element);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
}

export function disableAutoCleanup(): void {
  observer?.disconnect();
  observer = null;
}
