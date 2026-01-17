import type { EffectObject } from './types';
import { debug } from './debug';
import { getSelector } from './utils';

/**
 * Binding Registry
 * 
 * Solving Circular Reference Issues:
 * - Prevents Atom -> Subscription -> Callback -> DOM Element cycle.
 * - Uses WeakMap to track effects and cleanup functions per DOM element.
 * - Automatically unsubscribes when DOM elements are removed via MutationObserver.
 * 
 * Preventing Memory Leaks:
 * - Must call unsubscribe() when DOM is removed.
 * - Recursively cleans up child nodes.
 */
class BindingRegistry {
  // DOM Element -> Effect Array (for disposal)
  private effects = new WeakMap<Element, EffectObject[]>();
  
  // DOM Element -> Custom Cleanup Function Array
  private cleanups = new WeakMap<Element, Array<() => void>>();
  
  // Track bound elements (Performance optimization)
  private boundElements = new WeakSet<Element>();

  /**
   * Tracks elements that are temporarily detached (e.g. via .detach())
   * so they are NOT cleaned up by the MutationObserver.
   */
  private preservedNodes = new WeakSet<Node>();

  keep(node: Node): void {
    this.preservedNodes.add(node);
  }

  isKept(node: Node): boolean {
    return this.preservedNodes.has(node);
  }

  /**
   * Registers an Effect to be disposed later.
   */
  trackEffect(el: Element, fx: EffectObject): void {
    const list = this.effects.get(el) || [];
    list.push(fx);
    this.effects.set(el, list);
    this.boundElements.add(el);
  }

  /**
   * Registers a custom cleanup function (e.g., event listener removal).
   */
  trackCleanup(el: Element, fn: () => void): void {
    const list = this.cleanups.get(el) || [];
    list.push(fn);
    this.cleanups.set(el, list);
    this.boundElements.add(el);
  }

  /**
   * Checks if an element has bindings (Fast check).
   */
  hasBind(el: Element): boolean {
    return this.boundElements.has(el);
  }

  /**
   * Cleans up a single element.
   * - Disposes all Effects (severs connection with Atom).
   * - Executes all custom cleanups.
   */
  cleanup(el: Element): void {
    if (!this.boundElements.has(el)) return;

    debug.cleanup(getSelector(el));

    // 1. Dispose Effects - Unsubscribe from Atoms (Break circular reference!)
    const effects = this.effects.get(el);
    if (effects) {
      this.effects.delete(el); // Delete first to prevent re-entry
      effects.forEach(fx => {
        try { 
          fx.dispose(); 
        } catch (e) {
          debug.warn('Effect dispose error:', e);
        }
      });
    }

    // 2. Execute custom cleanups (e.g., remove event listeners)
    const cleanups = this.cleanups.get(el);
    if (cleanups) {
      this.cleanups.delete(el); // Delete first to prevent re-entry
      cleanups.forEach(fn => {
        try { fn(); } catch (e) {
          debug.warn('Cleanup error:', e);
        }
      });
    }

    this.boundElements.delete(el);
  }

  /**
   * Cleans up the element and all its descendants (Recursive).
   * - Essential for deep removal (empty(), remove(), etc.).
   */
  cleanupTree(el: Element): void {
    // Descendants first (Depth-First)
    const children = el.querySelectorAll('*');
    children.forEach(child => {
      if (this.boundElements.has(child)) {
        this.cleanup(child);
      }
    });
    
    // Then the element itself
    this.cleanup(el);
  }
}

export const registry = new BindingRegistry();

/**
 * MutationObserver for Auto-Cleanup
 * 
 * jQuery's .remove() or .empty() cannot clean up external library (Atom) subscriptions.
 * MutationObserver is essential to detect DOM removals and trigger cleanup.
 */

let observer: MutationObserver | null = null;

export function enableAutoCleanup(root: Element = document.body): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.removedNodes.forEach(node => {
        // If the node is marked as "kept" (e.g. .detach()), skip cleanup
        if (registry.isKept(node)) {
          return; 
        }

        if (node.isConnected) {
          return;
        }

        // Use nodeType === 1 check instead of instanceof Element to avoid
        // ReferenceError during test teardown where Element might be undefined
        if (node.nodeType === 1) {
          // Cleanup removed node and all its descendants recursively
          registry.cleanupTree(node as Element);
        }
      });
    }
  });

  observer.observe(root, { childList: true, subtree: true });
}

export function disableAutoCleanup(): void {
  observer?.disconnect();
  observer = null;
}
