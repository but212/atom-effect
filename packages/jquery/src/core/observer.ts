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

interface MutationBatchCallback {
  readonly attributes: readonly string[];
  readonly callback: (records: readonly MutationRecord[]) => void;
}

export class RootObserver {
  readonly #root: Node;
  #observer: MutationObserver | null = null;
  #deliverySignal: Text | undefined;
  #bufferedRecords: MutationRecord[] | undefined;
  #activeRemovalDelivery: readonly MutationRecord[] | undefined;
  readonly #removalCallbacks = new Set<(node: Node, record: MutationRecord) => void>();
  readonly #additionCallbacks = new Set<NodeAddedCallback>();
  readonly #attributeCallbacks = new Set<AttributeCallback>();
  readonly #batchCallbacks = new Set<MutationBatchCallback>();

  constructor(root: Node) {
    this.#root = root;
  }

  /**
   * Registers a callback to be called when a node is removed from this subtree.
   */
  onNodeRemoved(callback: (node: Node, record: MutationRecord) => void): () => void {
    const pending = this.collectPendingRecords();
    const delivering = this.#activeRemovalDelivery;
    if (pending.length === 0 && !delivering) {
      return this.#subscribe(this.#removalCallbacks, callback);
    }

    // A shared observer can already have records from before this subscription.
    const earlier = new WeakSet(pending);
    if (delivering) {
      for (const record of delivering) earlier.add(record);
    }
    return this.#subscribe(this.#removalCallbacks, (node, record) => {
      if (!earlier.has(record)) callback(node, record);
    });
  }

  /**
   * Registers a callback to be called when a node matching the selector is added to this subtree.
   */
  onNodeAdded(selector: string, callback: (element: Element) => void): () => void {
    return this.#subscribe(this.#additionCallbacks, { selector, callback });
  }

  /**
   * Registers a callback to be called when an attribute with the specified name is mutated.
   */
  onAttributeChanged(attributeName: string, callback: (element: Element) => void): () => void {
    return this.#subscribe(this.#attributeCallbacks, { attributeName, callback }, true);
  }

  /** Subscribes to a batch with old values for the requested attributes. */
  onMutationBatch(
    attributes: readonly string[],
    callback: MutationBatchCallback['callback']
  ): () => void {
    return this.#subscribe(this.#batchCallbacks, { attributes, callback }, true);
  }

  get hasRemovalCallbacks(): boolean {
    return this.#removalCallbacks.size > 0 || this.#batchCallbacks.size > 0;
  }

  /** Records already in delivery and therefore absent from takeRecords(). */
  get activeRemovalDelivery(): readonly MutationRecord[] | undefined {
    return this.#activeRemovalDelivery;
  }

  /** Takes a snapshot for synchronous detach tracking, without dropping observer notifications. */
  collectPendingRecords(): readonly MutationRecord[] {
    const observer = this.#observer;
    if (!observer) return [];

    const records = observer.takeRecords();
    if (records.length > 0) {
      let signal = this.#deliverySignal;
      this.#bufferedRecords ??= [];
      for (const record of records) {
        if (record.target !== signal) this.#bufferedRecords.push(record);
      }
      if (!signal) {
        signal = new Text();
        observer.observe(signal, { characterData: true });
        this.#deliverySignal = signal;
      }
      // Keep the already-queued native delivery alive after takeRecords() empties its queue.
      // The signal is detached and its characterData record is not dispatched to subscribers.
      signal.data = '';
    }
    return this.#bufferedRecords ?? [];
  }

  #subscribe<T>(callbacks: Set<T>, callback: T, attributesChanged = false): () => void {
    callbacks.add(callback);
    if (!this.#observer || attributesChanged) this.#updateObserver();
    return () => {
      if (!callbacks.delete(callback)) return;
      if (attributesChanged) this.#updateObserver();
      this.#checkEmpty();
    };
  }

  #hasCallbacks(): boolean {
    return (
      this.#removalCallbacks.size > 0 ||
      this.#additionCallbacks.size > 0 ||
      this.#attributeCallbacks.size > 0 ||
      this.#batchCallbacks.size > 0
    );
  }

  #updateObserver(): void {
    if (!this.#hasCallbacks()) {
      this.disconnect();
      return;
    }

    this.#observer ??= new MutationObserver((records) => this.#deliver(records));

    const options: MutationObserverInit = {
      childList: true,
      subtree: true,
    };

    if (this.#attributeCallbacks.size > 0 || this.#batchCallbacks.size > 0) {
      const filters = new Set<string>();
      for (const { attributeName } of this.#attributeCallbacks) filters.add(attributeName);
      for (const { attributes } of this.#batchCallbacks) {
        for (const attribute of attributes) filters.add(attribute);
      }
      if (filters.size > 0) {
        options.attributeFilter = Array.from(filters);
        options.attributeOldValue = this.#batchCallbacks.size > 0;
      }
    }

    this.#observer.observe(this.#root, options);
  }

  #deliver(records: MutationRecord[]): void {
    const signal = this.#deliverySignal;
    const visible = signal ? records.filter((record) => record.target !== signal) : records;
    const mutations = this.#bufferedRecords?.concat(visible) ?? visible;
    this.#bufferedRecords = undefined;
    if (mutations.length === 0) return;
    this.#activeRemovalDelivery = mutations;
    try {
      this.#dispatch(mutations);
    } finally {
      this.#activeRemovalDelivery = undefined;
    }
  }

  #dispatch(mutations: readonly MutationRecord[]): void {
    const batches = [...this.#batchCallbacks];
    // 1. Process removed nodes
    if (this.#removalCallbacks.size > 0) {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.removedNodes) {
          for (const callback of this.#removalCallbacks) {
            try {
              callback(node, mutation);
            } catch (error) {
              console.error('Error in onNodeRemoved callback:', error);
            }
          }
        }
      }
    }

    for (const batch of batches) {
      if (!this.#batchCallbacks.has(batch)) continue;
      try {
        batch.callback(mutations);
      } catch (error) {
        console.error('Error in onMutationBatch callback:', error);
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
  }

  #checkEmpty(): void {
    if (!this.#hasCallbacks()) {
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
    this.#deliverySignal = undefined;
    this.#bufferedRecords = undefined;
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
