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
 * Represents the lifecycle metadata for a bound element.
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
 * The central registry for managing reactive resources and element lifecycles.
 *
 * Logic: Safety & Memory Management
 * - WeakMap Storage: Binding records are stored in `WeakMap` instances to avoid
 *   holding strong references to DOM elements. This allows the garbage collector
 *   to reclaim memory even if elements are not explicitly unmounted.
 * - Flag System: `WeakSet` is used for `keep` and `ignored` states to ensure that
 *   metadata does not leak for nodes that are removed without a cleanup call.
 * - Performance: The registry uses CSS markers (`_aes-bound`, `_aes-has-shadow`)
 *   to perform high-speed scoped queries (`querySelectorAll`) during tree
 *   disposal, avoiding expensive full-tree traversals.
 *
 * @internal
 */
class BindingRegistry {
  private records = new WeakMap<Element, BindingRecord>();

  private kept = new WeakSet<Node>();

  private ignored = new WeakSet<Node>();

  private shadows = new WeakMap<Element, ShadowRoot>();

  private autoCleanupScheduled = false;

  /**
   * Marks a node to preserve its reactive resources even if detached from the DOM.
   * (e.g., used by jQuery's `.detach()` method).
   */
  keep(node: Node): void {
    this.kept.add(node);
  }

  /** Determines if a node is marked for resource preservation. */
  isKept(node: Node): boolean {
    return this.kept.has(node);
  }

  /**
   * Marks a node to be ignored by the next automated cleanup cycle.
   * This prevents redundant cleanup calls during complex DOM manipulations.
   */
  markIgnored(node: Node): void {
    this.ignored.add(node);
  }

  /** Determines if a node is currently marked to be ignored. */
  isIgnored(node: Node): boolean {
    return this.ignored.has(node);
  }

  /**
   * Removes the 'ignored' flag, re-enabling standard cleanup logic for the node.
   * @internal
   */
  unmarkIgnored(node: Node): void {
    this.ignored.delete(node);
  }

  /** @internal */
  isAutoCleanupScheduled(): boolean {
    return this.autoCleanupScheduled;
  }

  /** @internal */
  setAutoCleanupScheduled(scheduled: boolean): void {
    this.autoCleanupScheduled = scheduled;
  }

  /**
   * Performs a move-aware cleanup of a node and its descendants.
   *
   * Logic: Deferring the cleanup to a microtask allows elements to be
   * disconnected and then immediately reconnected (moved) without
   * losing their reactive state.
   *
   * @param node - The node to tentatively clean up.
   */
  deferCleanup(node: Node): void {
    this.ignored.add(node);
    queueMicrotask(() => {
      if (node.isConnected) {
        this.ignored.delete(node);
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
    this.shadows.set(host, sr);
  }

  /**
   * Safely adds a CSS marker to an element, deferring if it's currently being constructed.
   */
  private safeMark(element: Element, className: string): void {
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
    this.safeMark(host, MARK_SHADOW);
  }

  /**
   * Retrieves the ShadowRoot for a host element, including tracked 'closed' roots.
   * @internal
   */
  getShadow(host: Element): ShadowRoot | null {
    return Option.unwrapOr(
      Option.fromNullable(host.shadowRoot),
      Option.toNullable(Option.fromNullable(this.shadows.get(host)))
    );
  }

  /**
   * Retrieves or initializes the binding record for a specific element.
   *
   * Logic: The auto-cleanup MutationObserver is lazily initialized when
   * the first reactive binding is registered in the document.
   */
  private getOrCreateRecord(element: Element): BindingRecord {
    if (
      isAutoCleanupEnabled &&
      !this.autoCleanupScheduled &&
      typeof document !== 'undefined' &&
      document.body
    ) {
      this.autoCleanupScheduled = true;
      enableAutoCleanup(document.body);
    }

    return Option.unwrapOrElse(Option.fromNullable(this.records.get(element)), () => {
      const result: BindingRecord = {};
      this.records.set(element, result);
      this.safeMark(element, MARK_BOUND);
      return result;
    });
  }

  /** Internal helper to append a cleanup task to an element's record. */
  private addCleanup(element: Element, cleanupFunction: () => void): void {
    const record = this.getOrCreateRecord(element);
    if (!record.tasks) {
      record.tasks = new SlotBuffer<() => void>();
    }
    record.tasks.push(cleanupFunction);
  }

  /**
   * Registers a reactive effect to be tracked and disposed with the element.
   *
   * Constraint: Effects must be registered to ensure synchronous disposal
   * when the host element is destroyed or unmounted.
   *
   * @param element - The host element.
   * @param effect - The reactive effect object.
   */
  trackEffect(element: Element, effect: EffectObject): void {
    const selector = getSelector(element);
    this.addCleanup(element, () => {
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

  /** Registers a generic cleanup function to be executed with the element. @internal */
  onCleanup(element: Element, cleanupFunction: () => void): void {
    const selector = getSelector(element);
    this.addCleanup(element, () => {
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
    this.getOrCreateRecord(element).teardown = teardownFunction;
  }

  /** Determines if an element has any active bindings. */
  hasBind(element: Element): boolean {
    return this.records.has(element);
  }

  /**
   * Disposes of all reactive resources associated with a single node.
   *
   * @param node - The node to clean up.
   */
  cleanup(node: Node): void {
    this.kept.delete(node);
    this.ignored.delete(node);

    if (node.nodeType !== 1) return;
    const element = node as Element;

    const recordOpt = Option.fromNullable(this.records.get(element));

    if (Option.isSome(recordOpt)) {
      const record = recordOpt.value;
      this.records.delete(element);
      element.classList.remove(MARK_BOUND);

      // Execute component teardown if present
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

      // Execute and dispose of all cleanup tasks
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
   * Efficiently cleans up reactive bindings within a DOM subtree.
   *
   * Logic: Snapshot Strategy
   * This method uses `querySelectorAll` to obtain a static snapshot of bound
   * elements before iteration begins. This ensures stability and prevents
   * missed nodes if the DOM structure or classes are modified during cleanup.
   *
   * @param root - The root of the subtree or fragment to clean up.
   */
  cleanupDescendants(root: Element | DocumentFragment | ShadowRoot): void {
    const nodes = root.querySelectorAll(`.${MARK_BOUND}`);

    for (let i = 0, length = nodes.length; i < length; i++) {
      const node = nodes[i];
      if (node) {
        this.cleanup(node);
      }
    }

    // Optimization: Marker-based traversal
    // Instead of a full-tree walk, we jump directly to hosts known to possess
    // managed ShadowRoots to perform recursive cleanup.
    const shadowHosts = root.querySelectorAll(`.${MARK_SHADOW}`);
    for (let i = 0, length = shadowHosts.length; i < length; i++) {
      const el = shadowHosts[i] as Element;
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
 * Initializes an automated MutationObserver safety net for a specific root.
 *
 * Logic: DOM Safety Net
 * Standard browser operations (e.g., setting `innerHTML = ''`) bypass jQuery's
 * internal hooks. This observer acts as a fallback, detecting removed nodes
 * that were not processed by patched jQuery methods.
 *
 * @param root - The DOM element or fragment to monitor.
 * @internal
 */
export function enableAutoCleanup(root: Element | ShadowRoot | DocumentFragment): void {
  if (observerMap.has(root)) return;

  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mutationsLength = mutations.length; i < mutationsLength; i++) {
      const removedNodes = mutations[i]!.removedNodes;
      for (let j = 0, removedNodesLength = removedNodes.length; j < removedNodesLength; j++) {
        const node = removedNodes[j]!;

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
 * Disconnects the auto-cleanup observer for a specific root node.
 *
 * Logic: Scoped Disposal
 * This is used to release strong references held by the registry to specific
 * boundaries (e.g., ShadowRoots) to prevent memory leaks when components
 * are permanently removed.
 *
 * @param root - The specific node to stop monitoring.
 * @internal
 */
export function disableAutoCleanupFor(root: Node): void {
  const observer = observerMap.get(root);
  if (observer) {
    observer.disconnect();
    observerMap.delete(root);
  }
}
