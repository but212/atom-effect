/**
 * @module AEJAutoCleanup
 *
 * Responsibility:
 * Owns the MutationObserver safety net: whether it is allowed, whether the document-level root
 * has been scheduled, and the per-root observer subscriptions.
 *
 * Design Intent:
 * Removal handling is injected so this module never imports the registry it serves.
 */

import { getOrCreateRootObserver } from './observer';

type CleanupRoot = Element | ShadowRoot | DocumentFragment;

export class AutoCleanup {
  readonly #onRemoved: (element: Element) => void;
  readonly #onAdded?: ((element: Element) => void) | undefined;
  /** Roots currently observed, mapped to their observer un-subscriptions. */
  readonly #unsubscribeByRoot = new Map<Node, () => void>();
  #isAllowed = true;
  #isScheduled = false;

  constructor(
    onRemoved: (element: Element) => void,
    onAdded?: ((element: Element) => void) | undefined
  ) {
    this.#onRemoved = onRemoved;
    this.#onAdded = onAdded;
  }

  /**
   * Configures whether the automated MutationObserver cleanup system is allowed to run.
   *
   * Logic: This provides explicit control over the global 'safety-net' observer,
   * allowing it to be disabled in environments or scenarios where manual
   * lifecycle management is strictly enforced.
   */
  allow(allowed: boolean): void {
    this.#isAllowed = allowed;
  }

  isScheduled(): boolean {
    return this.#isScheduled;
  }

  /** Observes `root` and records that the document-level safety net is running. */
  start(root: CleanupRoot): void {
    this.#isScheduled = true;
    this.enable(root);
  }

  /**
   * Logic: Lazy Bootstrap
   * Starts observing `document.body` before the first binding is applied, deferring until the
   * DOM is ready when `body` does not exist yet.
   */
  ensureScheduled(): void {
    if (!this.#isAllowed || this.#isScheduled || typeof document === 'undefined') return;

    if (document.body) {
      this.start(document.body);
      return;
    }

    const initCleanup = () => {
      if (document.body && !this.#isScheduled) this.start(document.body);
      if (this.#isScheduled) {
        document.removeEventListener('DOMContentLoaded', initCleanup);
      }
    };
    document.addEventListener('DOMContentLoaded', initCleanup);
    queueMicrotask(initCleanup);
  }

  /**
   * Logic: DOM Safety Net
   * Automated fallback for standard DOM operations (like innerHTML = '')
   * that bypass jQuery's internal hooks.
   */
  enable(root: CleanupRoot): void {
    if (this.#unsubscribeByRoot.has(root)) return;

    const observer = getOrCreateRootObserver(root);
    const unsubscribeRemoved = observer.onNodeRemoved((node) => {
      // Condition: Clean up only elements that are genuinely disconnected from the document.
      if (node.nodeType !== 1 || (node as Element).isConnected) return;
      this.#onRemoved(node as Element);
    });

    const unsubscribeAdded = this.#onAdded
      ? observer.onNodeAdded('*', (element) => {
          this.#onAdded?.(element);
        })
      : undefined;

    this.#unsubscribeByRoot.set(root, () => {
      unsubscribeRemoved();
      unsubscribeAdded?.();
    });
  }

  /** Disconnects and destroys all registered auto-cleanup observers. */
  disable(): void {
    for (const unsubscribeCallback of this.#unsubscribeByRoot.values()) {
      unsubscribeCallback();
    }
    this.#unsubscribeByRoot.clear();
    this.#isScheduled = false;
  }

  /**
   * Logic: Boundary Leak Prevention
   * Releases strong references to specific roots (e.g., ShadowRoots) to
   * prevent memory leaks when components are permanently removed.
   */
  disableFor(root: Node): void {
    const unsubscribeCallback = this.#unsubscribeByRoot.get(root);
    if (unsubscribeCallback) {
      unsubscribeCallback();
      this.#unsubscribeByRoot.delete(root);
    }
  }
}
