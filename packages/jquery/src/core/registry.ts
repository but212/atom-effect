/**
 * @module AEJRegistry
 *
 * Responsibility:
 * Central engine for reactive resource tracking and deterministic memory
 * management. Coordinates the lifecycle of effects and component state
 * through a combination of WeakMap storage and MutationObserver safety nets.
 */

import { Option, Result, SlotBuffer } from '@but212/atom-effect-utils';
import { SYSTEM_BINDING, SYSTEM_CORE, SYSTEM_MOUNT } from '@/constants';
import type { EffectObject } from '@/types';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';

/** Global flag determining if the automated MutationObserver safety net is active. */
let isAutoCleanupEnabled = true;

/**
 * Configures whether the automated MutationObserver cleanup system is allowed to run.
 *
 * Logic: This provides explicit control over the global 'safety-net' observer,
 * allowing it to be disabled in environments or scenarios where manual
 * lifecycle management is strictly enforced.
 *
 * @param allowed - True to allow auto-cleanup, false to disable it.
 * @internal
 */
export function setAutoCleanupAllowed(allowed: boolean): void {
  isAutoCleanupEnabled = allowed;
}

/** Marker class used to identify elements with active reactive bindings. @internal */
const MARK_BOUND = '_aes-bound';
/** Marker class used to identify elements hosting managed ShadowRoots. @internal */
const MARK_SHADOW = '_aes-has-shadow';

/**
 * Logic: Lifecycle Metadata Contract
 * Represents the internal metadata for a bound element's reactive resources.
 * @internal
 */
export interface BindingRecord {
  /**
   * A collection of individual cleanup tasks (e.g., effect disposals).
   * Optimization: Uses SlotBuffer to minimize heap allocations for small
   * collections (1-4 items), which represents the vast majority of use cases.
   */
  tasks?: SlotBuffer<() => void>;
  /** An optional component-level teardown function. */
  teardown?: (() => void) | undefined;
}

/**
 * Logic: Central Lifecycle Engine
 * Manages the mapping between DOM elements and their reactive resources.
 *
 * Logic: Memory Management
 * - WeakMap Storage: Avoids holding strong references to DOM elements.
 * - Flag System: Uses WeakSet for efficient state tracking without leaks.
 * - Scoped Traversal: Employs CSS markers for high-speed tree disposal.
 *
 * @internal
 */
class BindingRegistry {
  #records = new WeakMap<Element, BindingRecord>();

  #kept = new WeakSet<Node>();

  #ignored = new WeakSet<Node>();

  #shadows = new WeakMap<Element, ShadowRoot>();

  #autoCleanupScheduled = false;

  /**
   * Logic: Resource Preservation
   * Marks a node to preserve its reactive resources even if detached.
   */
  keep(node: Node): void {
    this.#kept.add(node);
  }

  /** Determines if a node is marked for resource preservation. */
  isKept(node: Node): boolean {
    return this.#kept.has(node);
  }

  /**
   * Logic: Cleanup Suppression
   * Prevents automated cleanup during complex multi-step DOM manipulations.
   */
  markIgnored(node: Node): void {
    this.#ignored.add(node);
  }

  /** Determines if a node is currently marked to be ignored. */
  isIgnored(node: Node): boolean {
    return this.#ignored.has(node);
  }

  /**
   * Removes the 'ignored' flag, re-enabling standard cleanup logic for the node.
   * @internal
   */
  unmarkIgnored(node: Node): void {
    this.#ignored.delete(node);
  }

  /** @internal */
  isAutoCleanupScheduled(): boolean {
    return this.#autoCleanupScheduled;
  }

  /** @internal */
  setAutoCleanupScheduled(scheduled: boolean): void {
    this.#autoCleanupScheduled = scheduled;
  }

  /**
   * Logic: Move-Aware Deferred Cleanup
   * Defers cleanup to a microtask to allow elements to be disconnected
   * and immediately reconnected without state loss.
   */
  deferCleanup(node: Node): void {
    this.#ignored.add(node);
    queueMicrotask(() => {
      if (node.isConnected) {
        this.#ignored.delete(node);
      } else {
        this.cleanupTree(node);
      }
    });
  }

  /**
   * Registers a ShadowRoot to a host element for AEJ lifecycle tracking.
   *
   * @param host - The host element.
   * @param sr - The ShadowRoot (can be 'open' or 'closed').
   * @internal
   */
  registerShadow(host: Element, sr: ShadowRoot): void {
    this.#shadows.set(host, sr);
  }

  /**
   * Safely adds a CSS marker to an element, deferring if it's currently being constructed.
   */
  #safeMark(element: Element, className: string): void {
    if (element.isConnected) {
      element.classList.add(className);
    } else {
      // Logic: Defer class modification to avoid NotSupportedError/DOMException
      // during Custom Element construction (attributes cannot be set in constructor).
      queueMicrotask(() => element.classList.add(className));
    }
  }

  /**
   * Marks a host element to indicate it possesses a managed ShadowRoot.
   *
   * Optimization: This adds a CSS marker used by `cleanupDescendants` to
   * locate isolated Shadow DOM trees efficiently without full-tree traversal.
   *
   * @param host - The host element to mark.
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
    return Option.unwrapOr(
      Option.fromNullable(host.shadowRoot),
      Option.toNullable(Option.fromNullable(this.#shadows.get(host)))
    );
  }

  /**
   * Logic: Record Resolution
   * Retrieves or initializes the metadata record for an element, ensuring
   * the auto-cleanup safety net is active before the first binding is applied.
   */
  #getOrCreateRecord(element: Element): BindingRecord {
    if (
      isAutoCleanupEnabled &&
      !this.#autoCleanupScheduled &&
      typeof document !== 'undefined' &&
      document.body
    ) {
      this.#autoCleanupScheduled = true;
      enableAutoCleanup(document.body);
    }

    return Option.unwrapOrElse(Option.fromNullable(this.#records.get(element)), () => {
      const result: BindingRecord = {};
      this.#records.set(element, result);
      this.#safeMark(element, MARK_BOUND);
      return result;
    });
  }

  /** Logic: Task Aggregation @internal */
  #addCleanup(element: Element, cleanupFunction: () => void): void {
    const record = this.#getOrCreateRecord(element);
    record.tasks ??= new SlotBuffer<() => void>();
    record.tasks.push(cleanupFunction);
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
      const res = Result.tryCatch(() => effect.dispose());
      if (!res.ok) {
        debug.error(
          SYSTEM_BINDING.PREFIX,
          SYSTEM_CORE.ERRORS.EFFECT_DISPOSE_ERROR(selector),
          res.error
        );
      }
    });
  }

  /**
   * Logic: Lifecycle Hook
   * Registers a generic cleanup callback for manual resource management.
   * @internal
   */
  onCleanup(element: Element, cleanupFunction: () => void): void {
    const selector = getSelector(element);
    this.#addCleanup(element, () => {
      const res = Result.tryCatch(() => cleanupFunction());
      if (!res.ok) {
        debug.error(
          SYSTEM_BINDING.PREFIX,
          SYSTEM_BINDING.ERRORS.CLEANUP_ERROR(selector),
          res.error
        );
      }
    });
  }

  /** Assigns a component-level teardown function to an element. @internal */
  setTeardown(element: Element, teardownFunction: (() => void) | undefined): void {
    this.#getOrCreateRecord(element).teardown = teardownFunction;
  }

  /** Determines if an element has any active bindings. */
  hasBind(element: Element): boolean {
    return this.#records.has(element);
  }

  /**
   * Disposes of all reactive resources associated with a single node.
   *
   * @param node - The node to clean up.
   */
  cleanup(node: Node): void {
    this.#kept.delete(node);
    this.#ignored.delete(node);

    if (node.nodeType !== 1) return;
    const element = node as Element;

    const recordOpt = Option.fromNullable(this.#records.get(element));

    if (Option.isSome(recordOpt)) {
      const record = recordOpt.value;
      this.#records.delete(element);
      element.classList.remove(MARK_BOUND);

      // Logic: Component Teardown
      // Releases higher-level component resources (e.g., states, store connections).
      Option.match(Option.fromNullable(record.teardown), {
        some: (teardown) => {
          const res = Result.tryCatch(() => teardown());
          if (!res.ok) {
            const selector = getSelector(element);
            debug.error(
              SYSTEM_MOUNT.PREFIX,
              SYSTEM_MOUNT.ERRORS.CLEANUP_ERROR(selector),
              res.error
            );
          }
        },
        none: () => {},
      });

      // Logic: Atomic Cleanup Tasks
      // Disposes of individual effects and low-level reactive bindings.
      Option.match(Option.fromNullable(record.tasks), {
        some: (tasks) => {
          tasks.forEach((cleanupFunction) => cleanupFunction());
          tasks.dispose();
        },
        none: () => {},
      });
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
      const el = root as Element;
      const hasBound = el.getElementsByClassName(MARK_BOUND).length > 0;
      const hasShadow = el.getElementsByClassName(MARK_SHADOW).length > 0;
      if (!hasBound && !hasShadow) {
        return;
      }
    } else if (!root.querySelector(`.${MARK_BOUND}, .${MARK_SHADOW}`)) {
      return;
    }

    const nodes = root.querySelectorAll(`.${MARK_BOUND}`);

    for (const node of nodes) {
      if (node) {
        this.cleanup(node);
      }
    }

    // Optimization: Marker-based traversal
    // Instead of a full-tree walk, we jump directly to hosts known to possess
    // managed ShadowRoots to perform recursive cleanup.
    const shadowHosts = root.querySelectorAll(`.${MARK_SHADOW}`);
    for (const node of shadowHosts) {
      const el = node as Element;
      const sr = this.getShadow(el);
      if (sr) {
        this.cleanupTree(sr);
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
        const sr = this.getShadow(node as Element);
        if (sr) {
          this.cleanupTree(sr);
        }
      }
    }
    this.cleanup(node);
  }
}

/** The global instance of the BindingRegistry. */
export const registry = new BindingRegistry();

/** Mapping of root nodes to their associated MutationObservers for auto-cleanup. */
const observerMap = new Map<Node, MutationObserver>();

/**
 * Logic: DOM Safety Net
 * Automated fallback for standard DOM operations (like innerHTML = '')
 * that bypass jQuery's internal hooks.
 */
export function enableAutoCleanup(root: Element | ShadowRoot | DocumentFragment): void {
  if (observerMap.has(root)) return;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        // Condition: Clean up only elements that are genuinely disconnected
        // from the document and are not marked for preservation.
        if (node.nodeType !== 1 || (node as Element).isConnected) {
          continue;
        }

        const element = node as Element;
        if (registry.isKept(element) || registry.isIgnored(element)) {
          continue;
        }

        registry.cleanupTree(element);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  observerMap.set(root, observer);
}

/**
 * Disconnects and destroys all registered auto-cleanup observers.
 * @internal
 */
export function disableAutoCleanup(): void {
  observerMap.forEach((observer) => observer.disconnect());
  observerMap.clear();
  registry.setAutoCleanupScheduled(false);
}

/**
 * Logic: Boundary Leak Prevention
 * Releases strong references to specific roots (e.g., ShadowRoots) to
 * prevent memory leaks when components are permanently removed.
 */
export function disableAutoCleanupFor(root: Node): void {
  const observer = observerMap.get(root);
  if (observer) {
    observer.disconnect();
    observerMap.delete(root);
  }
}
