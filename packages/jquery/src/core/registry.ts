/**
 * @module AEJRegistry
 *
 * Responsibility:
 * Central engine for reactive resource tracking and deterministic memory
 * management. Coordinates the lifecycle of effects and component state
 * through a combination of WeakMap storage and MutationObserver safety nets.
 */

import type { EffectObject } from '@but212/atom-effect';
import { SlotBuffer } from '@but212/atom-effect-utils';
import { SYSTEM_BINDING, SYSTEM_CORE, SYSTEM_MOUNT } from '@/constants';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';
import { AutoCleanup } from './auto-cleanup';

/** Marker class used to identify elements with active reactive bindings. @internal */
const MARK_BOUND = '_aes-bound';
/** Marker class used to identify elements hosting managed ShadowRoots. @internal */
const MARK_SHADOW = '_aes-has-shadow';

/**
 * Logic: Lifecycle Metadata Contract
 * Represents the internal metadata for a bound element's reactive resources.
 * @internal
 */
interface BindingRecord {
  /**
   * A collection of individual cleanup tasks (e.g., effect disposals).
   * Optimization: Uses SlotBuffer to minimize heap allocations for small
   * collections (1-4 items), which represents the vast majority of use cases.
   */
  tasks?: SlotBuffer<() => void>;
  /** An optional component-level teardown function. */
  teardown?: (() => void) | undefined;
}

/** Internal WeakMap for Single Source of Truth */
const nodeStates = new WeakMap<Node, NodeState>();

interface NodeState {
  isKept?: boolean | undefined;
  isIgnored?: boolean | undefined;
  shadowRoot?: ShadowRoot;
  record?: BindingRecord | undefined;
}

/**
 * Logic: Central Lifecycle Engine
 * Manages the mapping between DOM elements and their reactive resources.
 *
 * Logic: Memory Management
 * - WeakMap Storage: Avoids holding strong references to DOM elements.
 * - Flag System: Keeps per-node flags in the same WeakMap, so state never outlives the node.
 * - Scoped Traversal: Employs CSS markers for high-speed tree disposal.
 *
 * @internal
 */
class BindingRegistry {
  #getState(node: Node): NodeState {
    let state = nodeStates.get(node);
    if (!state) {
      state = {};
      nodeStates.set(node, state);
    }
    return state;
  }

  /**
   * Logic: Resource Preservation
   * Marks a node to preserve its reactive resources even if detached.
   */
  keep(node: Node): void {
    this.#getState(node).isKept = true;
  }

  /**
   * Clears the resource preservation flag on a node.
   */
  unkeep(node: Node): void {
    const state = nodeStates.get(node);
    if (state?.isKept) {
      state.isKept = false;
    }
  }

  /** Determines if a node is marked for resource preservation. */
  isKept(node: Node): boolean {
    return !!nodeStates.get(node)?.isKept;
  }

  /**
   * Logic: Cleanup Suppression
   * Prevents automated cleanup during complex multi-step DOM manipulations.
   */
  markIgnored(node: Node): void {
    this.#getState(node).isIgnored = true;
  }

  /** Determines if a node is currently marked to be ignored. */
  isIgnored(node: Node): boolean {
    return !!nodeStates.get(node)?.isIgnored;
  }

  /** @internal */
  isAutoCleanupScheduled(): boolean {
    return autoCleanup.isScheduled();
  }

  /**
   * Registers a ShadowRoot to a host element for AEJ lifecycle tracking.
   *
   * @param host The host element.
   * @param shadowRoot The ShadowRoot (can be 'open' or 'closed').
   * @internal
   */
  registerShadow(host: Element, shadowRoot: ShadowRoot): void {
    this.#getState(host).shadowRoot = shadowRoot;
  }

  /**
   * Safely adds a CSS marker to an element, deferring if it's currently being constructed.
   */
  #safeMark(element: Element, className: string): void {
    try {
      element.classList.add(className);
    } catch {
      // Logic: Defer class modification to avoid NotSupportedError/DOMException
      // during Custom Element construction (attributes cannot be set in constructor).
      queueMicrotask(() => {
        if (this.hasBind(element) || this.getShadow(element)) {
          element.classList.add(className);
        }
      });
    }
  }

  /**
   * Marks a host element to indicate it possesses a managed ShadowRoot.
   *
   * Optimization: This adds a CSS marker used by `cleanupDescendants` to
   * locate isolated Shadow DOM trees efficiently without full-tree traversal.
   *
   * @param host The host element to mark.
   * @internal
   */
  markHost(host: Element): void {
    this.#safeMark(host, MARK_SHADOW);
  }

  /**
   * Retrieves the ShadowRoot for a host element, including tracked 'closed' roots.
   * @internal
   */
  getShadow(host: Element): ShadowRoot | null {
    return host.shadowRoot ?? nodeStates.get(host)?.shadowRoot ?? null;
  }

  /**
   * Logic: Record Resolution
   * Retrieves or initializes the metadata record for an element, ensuring
   * the auto-cleanup safety net is active before the first binding is applied.
   */
  #getOrCreateRecord(element: Element): BindingRecord {
    autoCleanup.ensureScheduled();

    const state = this.#getState(element);
    let record = state.record;
    if (!record) {
      record = {};
      state.record = record;
      this.#safeMark(element, MARK_BOUND);
    }
    return record;
  }

  /** Logic: Task Aggregation @internal */
  #addCleanup(element: Element, cleanupFunction: () => void): () => void {
    const record = this.#getOrCreateRecord(element);
    record.tasks ??= new SlotBuffer<() => void>();
    const task = cleanupFunction;
    record.tasks.push(task);
    return () => {
      record.tasks?.remove(task);
    };
  }

  /**
   * Logic: Reactive Effect Tracking
   * Binds an effect to an element's lifecycle for deterministic disposal.
   *
   * Constraint: Deterministic Disposal
   * Ensures effects are released synchronously when the host is unmounted.
   */
  trackEffect(element: Element, effect: EffectObject): void {
    const selector = getSelector(element);
    this.#addCleanup(element, () => {
      try {
        effect.dispose();
      } catch (error) {
        debug.error(
          SYSTEM_BINDING.PREFIX,
          SYSTEM_CORE.ERRORS.EFFECT_DISPOSE_ERROR(selector),
          error
        );
      }
    });
  }

  /**
   * Logic: Lifecycle Hook
   * Registers a generic cleanup callback for manual resource management.
   * @internal
   */
  onCleanup(element: Element, cleanupFunction: () => void): () => void {
    const selector = getSelector(element);
    return this.#addCleanup(element, () => {
      try {
        cleanupFunction();
      } catch (error) {
        debug.error(SYSTEM_BINDING.PREFIX, SYSTEM_BINDING.ERRORS.CLEANUP_ERROR(selector), error);
      }
    });
  }

  /** Assigns a component-level teardown function to an element. @internal */
  setTeardown(element: Element, teardownFunction: (() => void) | undefined): void {
    this.#getOrCreateRecord(element).teardown = teardownFunction;
  }

  /** Determines if an element has any active bindings. */
  hasBind(element: Element): boolean {
    return !!nodeStates.get(element)?.record;
  }

  /**
   * Disposes of all reactive resources associated with a single node.
   *
   * @param node The node to clean up.
   */
  cleanup(node: Node): void {
    const state = nodeStates.get(node);
    if (state) {
      state.isKept = undefined;
      state.isIgnored = undefined;
    }
    autoCleanup.disableFor(node);

    if (node.nodeType !== 1) {
      if (state && !state.shadowRoot) {
        nodeStates.delete(node);
      }
      return;
    }
    const element = node as Element;

    const record = state?.record;

    if (state && !state.shadowRoot) {
      nodeStates.delete(node);
    } else if (state) {
      state.record = undefined;
    }

    if (record) {
      element.classList.remove(MARK_BOUND);

      // Logic: Component Teardown
      // Releases higher-level component resources (e.g., states, store connections).
      if (record.teardown) {
        try {
          record.teardown();
        } catch (error) {
          const selector = getSelector(element);
          debug.error(SYSTEM_MOUNT.PREFIX, SYSTEM_MOUNT.ERRORS.CLEANUP_ERROR(selector), error);
        }
      }

      // Logic: Atomic Cleanup Tasks
      // Disposes of individual effects and low-level reactive bindings.
      if (record.tasks) {
        record.tasks.forEach((cleanupFunction: () => void) => cleanupFunction());
        record.tasks.dispose();
      }
    } else {
      // Logic: Ensure idempotency. If no record exists, just remove the marker class.
      element.classList.remove(MARK_BOUND);
    }
  }

  /**
   * Optimization: Scoped Tree Disposal
   * Efficiently cleans up reactive bindings within a DOM subtree.
   *
   * Logic: Snapshot Stability
   * Uses `querySelectorAll` to obtain a static snapshot, preventing missed
   * nodes if the DOM structure shifts during the iteration cycle.
   */
  cleanupDescendants(root: Element | DocumentFragment | ShadowRoot): void {
    // Fast-path: Exit early if no bound elements or shadow hosts exist in the subtree.
    if (root.nodeType === 1) {
      const element = root as Element;
      const hasBound = element.getElementsByClassName(MARK_BOUND).length > 0;
      const hasShadow = element.getElementsByClassName(MARK_SHADOW).length > 0;
      if (!hasBound && !hasShadow) {
        return;
      }
    } else if (!root.querySelector(`.${MARK_BOUND}, .${MARK_SHADOW}`)) {
      return;
    }

    const nodes = root.querySelectorAll(`.${MARK_BOUND}`);

    for (const hostElement of nodes) {
      if (hostElement) {
        this.cleanup(hostElement);
      }
    }

    // Optimization: Marker-based traversal
    // Instead of a full-tree walk, we jump directly to hosts known to possess
    // managed ShadowRoots to perform recursive cleanup.
    const shadowHosts = root.querySelectorAll(`.${MARK_SHADOW}`);
    for (const hostElement of shadowHosts) {
      const element = hostElement as Element;
      const shadowRoot = this.getShadow(element);
      if (shadowRoot) {
        this.cleanupTree(shadowRoot);
      }
    }
  }

  /**
   * Performs a deep recursive cleanup of a node and all its internal subtrees (including Shadow DOM).
   * @internal
   */
  cleanupTree(node: Node): void {
    if (node.nodeType === 1 || node.nodeType === 11) {
      const root = node as Element | DocumentFragment | ShadowRoot;
      this.cleanupDescendants(root);

      // Constraint: Shadow DOM trees must be cleaned recursively as they are
      // isolated from standard query selectors.
      if (node.nodeType === 1) {
        const shadowRoot = this.getShadow(node as Element);
        if (shadowRoot) {
          this.cleanupTree(shadowRoot);
        }
      }
    }
    this.cleanup(node);
  }
}

/** The global instance of the BindingRegistry. */
export const registry = new BindingRegistry();

/** Observer safety net; removed elements are cleaned unless explicitly kept or ignored. */
export const autoCleanup = new AutoCleanup(
  (element) => {
    if (registry.isKept(element)) {
      registry.unkeep(element);
      return;
    }
    if (registry.isIgnored(element)) return;
    registry.cleanupTree(element);
  },
  (element) => {
    if (registry.isKept(element)) {
      registry.unkeep(element);
    }
  }
);

export const enableAutoCleanup = (root: Element | ShadowRoot | DocumentFragment): void =>
  autoCleanup.enable(root);

/** @internal */
export const disableAutoCleanup = (): void => autoCleanup.disable();
