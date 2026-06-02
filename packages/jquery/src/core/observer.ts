/**
 * @module AEJObserver
 *
 * Responsibility:
 * Consolidated MutationObserver coordinator. Manages a single MutationObserver
 * instance per root node to coordinate both added-node tracking (for bindings/parts)
 * and removed-node tracking (for auto-cleanup) with automatic cleanup.
 */

export interface NodeAddedCallback {
  selector: string;
  callback: (element: Element) => void;
}

export class RootObserver {
  readonly #root: Node;
  #observer: MutationObserver | null = null;
  readonly #removalCallbacks = new Set<(node: Node) => void>();
  readonly #additionCallbacks = new Set<NodeAddedCallback>();

  constructor(root: Node) {
    this.#root = root;
  }

  /**
   * Registers a callback to be called when a node is removed from this subtree.
   */
  onNodeRemoved(callback: (node: Node) => void): () => void {
    this.#removalCallbacks.add(callback);
    this.#ensureObserver();
    return () => {
      this.#removalCallbacks.delete(callback);
      this.#checkEmpty();
    };
  }

  /**
   * Registers a callback to be called when a node matching the selector is added to this subtree.
   */
  onNodeAdded(selector: string, callback: (element: Element) => void): () => void {
    const record = { selector, callback };
    this.#additionCallbacks.add(record);
    this.#ensureObserver();
    return () => {
      this.#additionCallbacks.delete(record);
      this.#checkEmpty();
    };
  }

  #ensureObserver(): void {
    if (this.#observer) return;

    this.#observer = new MutationObserver((mutations) => {
      // 1. Process removed nodes
      if (this.#removalCallbacks.size > 0) {
        for (const m of mutations) {
          for (const node of m.removedNodes) {
            for (const cb of this.#removalCallbacks) {
              cb(node);
            }
          }
        }
      }

      // 2. Process added nodes
      if (this.#additionCallbacks.size > 0) {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node instanceof Element) {
              for (const record of this.#additionCallbacks) {
                if (node.matches(record.selector)) {
                  record.callback(node);
                }
                const children = node.querySelectorAll(record.selector);
                for (const child of children) {
                  record.callback(child);
                }
              }
            }
          }
        }
      }
    });

    this.#observer.observe(this.#root, { childList: true, subtree: true });
  }

  #checkEmpty(): void {
    if (this.#removalCallbacks.size === 0 && this.#additionCallbacks.size === 0) {
      this.disconnect();
      rootObserversMap.delete(this.#root);
    }
  }

  /**
   * Disconnects the MutationObserver.
   */
  disconnect(): void {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }
  }
}

/** Mapping of root nodes to their associated RootObserver instances. */
export const rootObserversMap = new Map<Node, RootObserver>();

/**
 * Retrieves an existing RootObserver or creates a new one for the given root.
 */
export function getOrCreateRootObserver(root: Node): RootObserver {
  let observer = rootObserversMap.get(root);
  if (!observer) {
    observer = new RootObserver(root);
    rootObserversMap.set(root, observer);
  }
  return observer;
}
