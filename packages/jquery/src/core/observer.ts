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

export interface AttributeCallback {
  attributeName: string;
  callback: (element: Element) => void;
}

export class RootObserver {
  readonly #root: Node;
  #observer: MutationObserver | null = null;
  readonly #removalCallbacks = new Set<(node: Node) => void>();
  readonly #additionCallbacks = new Set<NodeAddedCallback>();
  readonly #attributeCallbacks = new Set<AttributeCallback>();

  constructor(root: Node) {
    this.#root = root;
  }

  /**
   * Registers a callback to be called when a node is removed from this subtree.
   */
  onNodeRemoved(callback: (node: Node) => void): () => void {
    this.#removalCallbacks.add(callback);
    this.#updateObserver();
    return () => {
      this.#removalCallbacks.delete(callback);
      this.#updateObserver();
      this.#checkEmpty();
    };
  }

  /**
   * Registers a callback to be called when a node matching the selector is added to this subtree.
   */
  onNodeAdded(selector: string, callback: (element: Element) => void): () => void {
    const record = { selector, callback };
    this.#additionCallbacks.add(record);
    this.#updateObserver();
    return () => {
      this.#additionCallbacks.delete(record);
      this.#updateObserver();
      this.#checkEmpty();
    };
  }

  /**
   * Registers a callback to be called when an attribute with the specified name is mutated.
   */
  onAttributeChanged(attributeName: string, callback: (element: Element) => void): () => void {
    const record = { attributeName, callback };
    this.#attributeCallbacks.add(record);
    this.#updateObserver();
    return () => {
      this.#attributeCallbacks.delete(record);
      this.#updateObserver();
      this.#checkEmpty();
    };
  }

  #updateObserver(): void {
    if (
      this.#removalCallbacks.size === 0 &&
      this.#additionCallbacks.size === 0 &&
      this.#attributeCallbacks.size === 0
    ) {
      this.disconnect();
      return;
    }

    if (!this.#observer) {
      this.#observer = new MutationObserver((mutations) => {
        // 1. Process removed nodes
        if (this.#removalCallbacks.size > 0) {
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              for (const node of mutation.removedNodes) {
                for (const callback of this.#removalCallbacks) {
                  try {
                    callback(node);
                  } catch (error) {
                    console.error('Error in onNodeRemoved callback:', error);
                  }
                }
              }
            }
          }
        }

        // 2. Process added nodes
        if (this.#additionCallbacks.size > 0) {
          // Collect all element nodes added in this batch
          const addedElements: Element[] = [];
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                  // Node.ELEMENT_NODE
                  addedElements.push(node as Element);
                }
              }
            }
          }

          if (addedElements.length > 0) {
            for (const record of this.#additionCallbacks) {
              const matchedElements = new Set<Element>();

              for (const element of addedElements) {
                try {
                  if (element.matches(record.selector)) {
                    matchedElements.add(element);
                  }
                  const children = element.querySelectorAll(record.selector);
                  for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    if (child) matchedElements.add(child);
                  }
                } catch (error) {
                  console.error('Error querying or processing onNodeAdded:', error);
                }
              }

              for (const element of matchedElements) {
                try {
                  record.callback(element);
                } catch (error) {
                  console.error('Error in onNodeAdded callback:', error);
                }
              }
            }
          }
        }

        // 3. Process attribute mutations
        if (this.#attributeCallbacks.size > 0) {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName) {
              for (const record of this.#attributeCallbacks) {
                if (record.attributeName === mutation.attributeName) {
                  try {
                    record.callback(mutation.target as Element);
                  } catch (error) {
                    console.error('Error in onAttributeChanged callback:', error);
                  }
                }
              }
            }
          }
        }
      });
    }

    const options: MutationObserverInit = {
      childList: true,
      subtree: true,
    };

    if (this.#attributeCallbacks.size > 0) {
      options.attributes = true;
      const filters = new Set<string>();
      for (const record of this.#attributeCallbacks) {
        filters.add(record.attributeName);
      }
      options.attributeFilter = Array.from(filters);
    }

    this.#observer.observe(this.#root, options);
  }

  #checkEmpty(): void {
    if (
      this.#removalCallbacks.size === 0 &&
      this.#additionCallbacks.size === 0 &&
      this.#attributeCallbacks.size === 0
    ) {
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
export const rootObserversMap = new WeakMap<Node, RootObserver>();

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
