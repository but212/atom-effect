import { debug } from './debug';
import type { EffectObject } from './types';
import { getSelector } from './utils';

/**
 * Marker class for bound elements to optimize selector engines.
 */
const AES_BOUND = '_aes-bound';

/**
 * Binding Registry
 *
 * Highly optimized for performance:
 * - Uses WeakMap for zero-leak DOM associations.
 * - Minimal allocations in the tracking path.
 * - Efficient tree traversal for cleanup.
 */
class BindingRegistry {
  private effects = new WeakMap<Element, EffectObject[]>();
  private cleanups = new WeakMap<Element, Array<() => void>>();
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

  private _getOrCreateList<V>(el: Element, map: WeakMap<Element, V[]>): V[] {
    let list = map.get(el);
    if (!list) {
      list = [];
      map.set(el, list);
      if (!this.boundElements.has(el)) {
        this.boundElements.add(el);
        el.classList.add(AES_BOUND);
      }
    }
    return list;
  }

  trackEffect(el: Element, fx: EffectObject): void {
    this._getOrCreateList(el, this.effects).push(fx);
  }

  trackCleanup(el: Element, fn: () => void): void {
    this._getOrCreateList(el, this.cleanups).push(fn);
  }

  hasBind(el: Element): boolean {
    return this.boundElements.has(el);
  }

  cleanup(el: Element): void {
    if (!this.boundElements.delete(el)) return;
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);
    el.classList.remove(AES_BOUND);

    debug.cleanup(getSelector(el));

    // 1. Dispose Effects (Atom -> Subscription severed)
    const effects = this.effects.get(el);
    if (effects) {
      this.effects.delete(el);
      for (let i = 0, len = effects.length; i < len; i++) {
        try {
          effects[i]?.dispose();
        } catch (e) {
          debug.warn('Effect dispose error:', e);
        }
      }
    }

    // 2. Execute custom cleanups
    const cleanups = this.cleanups.get(el);
    if (cleanups) {
      this.cleanups.delete(el);
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
      const removed = mutations[i]?.removedNodes;
      if (!removed) continue;

      for (let j = 0, rLen = removed.length; j < rLen; j++) {
        const node = removed[j]!;
        // Skip if kept (detached), explicitly ignored, or still connected
        if (registry.isKept(node) || registry.isIgnored(node) || node.isConnected) continue;

        if (node.nodeType === 1) {
          registry.cleanupTree(node as Element);
        }
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
}

export function disableAutoCleanup(): void {
  observer?.disconnect();
  observer = null;
}
