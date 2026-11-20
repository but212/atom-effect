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
import { getNodeType, getSelector } from '@/utils';
import { debug } from '@/utils/debug';
import { getOrCreateRootObserver, type RootObserver, rootObserversMap } from './observer';

type CleanupRoot = Element | ShadowRoot | DocumentFragment;
type CleanupReason = 'dispose' | 'unbind';
type CleanupTask = (reason: CleanupReason) => void;

// HTML's built-in attachShadow() hosts; autonomous custom elements are also eligible.
const SHADOW_HOST_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'body',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'main',
  'nav',
  'p',
  'section',
  'span',
]);

const parentNodeGetter = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode')?.get as
  | ((this: Node) => Node | null)
  | undefined;
const isConnectedGetter = Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected')?.get as
  | ((this: Node) => boolean)
  | undefined;
const localNameGetter = Object.getOwnPropertyDescriptor(Element.prototype, 'localName')?.get as
  | ((this: Element) => string)
  | undefined;

/** @internal */
export function getParentNode(node: Node): Node | null {
  try {
    return parentNodeGetter ? parentNodeGetter.call(node) : node.parentNode;
  } catch {
    return null;
  }
}

function isNodeConnected(node: Node): boolean {
  try {
    return isConnectedGetter ? isConnectedGetter.call(node) : node.isConnected;
  } catch {
    return false;
  }
}

function getLocalName(element: Element): string {
  try {
    return (localNameGetter ? localNameGetter.call(element) : element.localName) ?? '';
  } catch {
    return '';
  }
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return getNodeType(node) === 11 && 'host' in node;
}

function containsIncludingShadow(ancestor: Node, node: Node): boolean {
  const { contains, getRootNode } = Node.prototype;
  let current = node;
  while (!contains.call(ancestor, current)) {
    const root = getRootNode.call(current);
    if (!isShadowRoot(root)) return false;
    current = root.host;
  }
  return true;
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
interface BindingRecord {
  /**
   * A collection of individual cleanup tasks (e.g., effect disposals).
   * Optimization: Uses SlotBuffer to minimize heap allocations for small
   * collections (1-4 items), which represents the vast majority of use cases.
   */
  tasks?: SlotBuffer<CleanupTask>;
  /** The roots that observe removal of a bound target, keyed by cleanup task. */
  removalRoots?: Map<CleanupTask, () => readonly Node[]>;
  /** An optional component-level teardown function. */
  teardown?: (() => void) | undefined;
}

/** Internal WeakMap for Single Source of Truth */
const nodeStates = new WeakMap<Node, NodeState>();

interface NodeState {
  shadowRoot?: ShadowRoot;
  record?: BindingRecord | undefined;
}

interface RemovalCheckpoint {
  readonly root: Node;
  readonly observer: RootObserver;
  start: number;
}

interface BufferedRemovals {
  readonly byNode: Map<Node, MutationRecord[]>;
  indexed: number;
}

interface RemovalBatch {
  readonly journal: MutationObserver;
  readonly checkpoints: RemovalCheckpoint[];
  coverage?: { parent: Node; checkpoints: RemovalCheckpoint[] };
  active: boolean;
  invalid: boolean;
}

function removesOnly(record: MutationRecord | undefined, parent: Node, target: Node): boolean {
  return (
    record?.target === parent &&
    record.removedNodes.length === 1 &&
    record.removedNodes[0] === target &&
    record.addedNodes.length === 0
  );
}

/**
 * Logic: Central Lifecycle Engine
 * Manages the mapping between DOM elements and their reactive resources.
 *
 * Logic: Memory Management
 * - WeakMap Storage: Avoids holding strong references to DOM elements.
 * - Mutation records scope cleanup suppression to a single observer delivery.
 * - Scoped Traversal: Employs CSS markers for high-speed tree disposal.
 *
 * @internal
 */
class BindingRegistry {
  readonly #autoCleanupRoots = new Map<Node, { observer: RootObserver; unsubscribe: () => void }>();
  readonly #preservedRemovals = new WeakMap<MutationRecord, Set<Node>>();
  readonly #bufferedRemovals = new WeakMap<readonly MutationRecord[], BufferedRemovals>();
  readonly #pendingShadowMarkers = new Set<Element>();
  #removalBatch: RemovalBatch | undefined;
  #isAutoCleanupAllowed = true;
  #isAutoCleanupScheduled = false;

  #getState(node: Node): NodeState {
    let state = nodeStates.get(node);
    if (!state) {
      state = {};
      nodeStates.set(node, state);
    }
    return state;
  }

  #preserveRemoval(record: MutationRecord, target: Node): void {
    let nodes = this.#preservedRemovals.get(record);
    if (!nodes) {
      nodes = new Set();
      this.#preservedRemovals.set(record, nodes);
    }
    nodes.add(target);
  }

  #preserveEarlierMoves(
    records: readonly MutationRecord[] | undefined,
    target: Node,
    preserveSubtree: boolean
  ): void {
    if (!records?.length) return;
    let index = this.#bufferedRemovals.get(records);
    if (!index) {
      index = { byNode: new Map(), indexed: 0 };
      this.#bufferedRemovals.set(records, index);
    }

    for (let i = index.indexed; i < records.length; i++) {
      const record = records[i];
      if (!record) continue;
      for (const node of record.removedNodes) {
        if (getNodeType(node) !== 1 || this.#preservedRemovals.get(record)?.has(node)) continue;
        const removals = index.byNode.get(node);
        if (removals) removals.push(record);
        else index.byNode.set(node, [record]);
      }
    }
    index.indexed = records.length;

    const { byNode } = index;
    const preserve = (node: Node) => {
      const removals = byNode.get(node);
      if (!removals) return;
      for (const record of removals) this.#preserveRemoval(record, node);
      byNode.delete(node);
      // A moved subtree must still be reachable by cleanup after reattachment.
      if (preserveSubtree) this.#registerMovedShadowAncestors(node as Element);
    };
    preserve(target);
    if (!preserveSubtree || byNode.size === 0 || getNodeType(target) !== 1) return;

    // Small subtrees can look up candidates directly; for a large subtree, cap the
    // walk at the number of candidates and use containment checks for the rest.
    let budget = byNode.size;
    let mayHideClosedRoot = false;
    const roots = [target];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let node: Node | null = root; node; node = walker.nextNode()) {
        if (getNodeType(node) !== 1) continue;
        if (node !== target) {
          if (budget-- === 0) {
            for (const candidate of byNode.keys()) {
              if (containsIncludingShadow(target, candidate)) preserve(candidate);
            }
            return;
          }
          preserve(node);
          if (byNode.size === 0) return;
        }
        const element = node as Element;
        const shadow = this.getShadow(element);
        if (shadow && isShadowRoot(shadow)) {
          roots.push(shadow);
        } else {
          const localName = getLocalName(element);
          if (localName.includes('-') || SHADOW_HOST_TAGS.has(localName)) {
            mayHideClosedRoot = true;
          }
        }
      }
    }

    // No cross-boundary candidate can belong to a tree with only known roots or non-hosts.
    if (!mayHideClosedRoot) return;
    // A candidate can enter an unregistered closed root without queuing another record.
    const { getRootNode } = Node.prototype;
    for (const candidate of byNode.keys()) {
      // Recheck parentage: a disconnected callback can move a pending removal into a closed root.
      if (getParentNode(candidate) === null) continue;
      const root = getRootNode.call(candidate);
      if (isShadowRoot(root) && containsIncludingShadow(target, root.host)) preserve(candidate);
    }
  }

  /** Whether a cleanup observer covers this node as a descendant. @internal */
  isInObservedTree(node: Node): boolean {
    for (const root of this.#autoCleanupRoots.keys()) {
      if (root !== node && containsIncludingShadow(root, node)) return true;
    }
    return false;
  }

  /** Amortizes observer snapshots for bulk removal of siblings from one parent. */
  withRemovalBatch(run: () => void): void {
    if (this.#removalBatch || this.#autoCleanupRoots.size < 2) {
      run();
      return;
    }

    const checkpoints: RemovalCheckpoint[] = [];
    for (const [root, { observer }] of this.#autoCleanupRoots) {
      const records = observer.collectPendingRecords();
      // A pending or delivering removal may need per-target move reconciliation.
      if (
        observer.activeRemovalDelivery ||
        records.some((record) => record.removedNodes.length > 0)
      ) {
        run();
        return;
      }
      checkpoints.push({ root, observer, start: records.length });
    }

    const journal = new MutationObserver(() => {});
    for (const { root } of checkpoints) journal.observe(root, { childList: true, subtree: true });
    this.#removalBatch = { journal, checkpoints, active: false, invalid: false };
    try {
      run();
    } finally {
      this.#removalBatch = undefined;
      journal.disconnect();
    }
  }

  #preserveFromCheckpoints(checkpoints: RemovalCheckpoint[], parent: Node, target: Node): void {
    for (const checkpoint of checkpoints) {
      const records = checkpoint.observer.collectPendingRecords();
      for (let i = checkpoint.start; i < records.length; i++) {
        const record = records[i];
        if (record && removesOnly(record, parent, target)) {
          // removeChild queues its record before any disconnected callbacks run.
          this.#preserveRemoval(record, target);
          break;
        }
      }
      checkpoint.start = records.length;
    }
  }

  #tryBatchedRemoval(parent: Node, target: Node, remove: () => void): boolean {
    const batch = this.#removalBatch;
    if (!batch || batch.invalid) return false;
    if (
      batch.active ||
      (batch.coverage && batch.coverage.parent !== parent) ||
      batch.journal.takeRecords().length > 0
    ) {
      batch.invalid = true;
      return false;
    }
    batch.coverage ??= {
      parent,
      checkpoints: batch.checkpoints.filter(({ root }) =>
        Node.prototype.contains.call(root, parent)
      ),
    };

    // The journal only selects a fast path. Extra DOM changes (including custom-element
    // callbacks) fall back to every original observer, using its exact pre-removal cursor.
    batch.active = true;
    try {
      remove();
    } finally {
      batch.active = false;
      const records = batch.journal.takeRecords();
      if (records.length !== 1 || !removesOnly(records[0], parent, target)) batch.invalid = true;
      this.#preserveFromCheckpoints(
        batch.invalid ? batch.checkpoints : batch.coverage.checkpoints,
        parent,
        target
      );
    }
    return true;
  }

  /** Preserves pending removals of a target that was already parentless at detach entry. */
  preserveDetached(target: Node, preserveSubtree: boolean): void {
    if (getNodeType(target) !== 1) return;
    if (preserveSubtree) this.#localDetachCheckpoints(null, target);
    for (const { observer } of this.#autoCleanupRoots.values()) {
      this.#preserveEarlierMoves(observer.activeRemovalDelivery, target, preserveSubtree);
      this.#preserveEarlierMoves(observer.collectPendingRecords(), target, preserveSubtree);
    }
  }

  isPreservedRemoval(node: Node, record: MutationRecord): boolean {
    return this.#preservedRemovals.get(record)?.has(node) ?? false;
  }

  // Form observers track ownership even when auto-cleanup is off or the form is disconnected.
  #localDetachCheckpoints(parent: Node | null, target: Node): RemovalCheckpoint[] {
    const observers = new Map<Node, RootObserver>();
    const add = (root: Node) => {
      if (observers.has(root) || this.#autoCleanupRoots.has(root)) return;
      const observer = rootObserversMap.get(root);
      if (observer?.hasRemovalCallbacks) observers.set(root, observer);
    };
    for (let root = parent; root; root = getParentNode(root)) add(root);

    // Native moves may already have taken the control out of the form observer's subtree.
    if (getNodeType(target) === 1) {
      const addOwner = (element: Element) => {
        const removalRoots = nodeStates.get(element)?.record?.removalRoots;
        if (!removalRoots) return;
        for (const getRoots of removalRoots.values()) {
          for (const root of getRoots()) add(root);
        }
      };
      const roots: Node[] = [target];
      const visit = (element: Element) => {
        addOwner(element);
        const shadow = this.getShadow(element);
        if (shadow && isShadowRoot(shadow)) roots.push(shadow);
      };
      for (const currentRoot of roots) {
        if (getNodeType(currentRoot) === 1) visit(currentRoot as Element);
        if (Node.prototype.hasChildNodes.call(currentRoot)) {
          const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            visit(node as Element);
          }
        }
      }
    }
    return Array.from(observers, ([root, observer]) => {
      const records = observer.collectPendingRecords();
      this.#preserveEarlierMoves(observer.activeRemovalDelivery, target, true);
      this.#preserveEarlierMoves(records, target, true);
      return { root, observer, start: records.length };
    });
  }

  /** Skips the jQuery removal, but not later native removals of the same node. */
  preserveDuringRemoval(target: Node, remove: () => void, preserveSubtree: boolean): void {
    const parent = getParentNode(target);
    if (!parent) {
      remove();
      return;
    }

    const local = preserveSubtree ? this.#localDetachCheckpoints(parent, target) : [];
    const run =
      local.length === 0
        ? remove
        : () => {
            try {
              remove();
            } finally {
              this.#preserveFromCheckpoints(local, parent, target);
            }
          };
    if (this.#autoCleanupRoots.size === 0) {
      run();
      return;
    }
    if (this.#tryBatchedRemoval(parent, target, run)) return;

    // Overlapping roots receive distinct records for the same DOM mutation.
    const checkpoints = Array.from(this.#autoCleanupRoots, ([root, { observer }]) => {
      const records = observer.collectPendingRecords();
      this.#preserveEarlierMoves(observer.activeRemovalDelivery, target, preserveSubtree);
      this.#preserveEarlierMoves(records, target, preserveSubtree);
      return { root, observer, start: records.length };
    });
    try {
      run();
    } finally {
      this.#preserveFromCheckpoints(checkpoints, parent, target);
    }
  }

  /** @internal */
  isAutoCleanupScheduled(): boolean {
    return this.#isAutoCleanupScheduled;
  }

  /** @internal */
  allowAutoCleanup(allowed: boolean): void {
    this.#isAutoCleanupAllowed = allowed;
  }

  /** @internal */
  startAutoCleanup(root: CleanupRoot): void {
    this.#isAutoCleanupScheduled = true;
    this.enableAutoCleanup(root);
  }

  /** @internal */
  disableAutoCleanup(): void {
    if (this.#removalBatch) this.#removalBatch.invalid = true;
    for (const { unsubscribe } of this.#autoCleanupRoots.values()) unsubscribe();
    this.#autoCleanupRoots.clear();
    this.#isAutoCleanupScheduled = false;
  }

  #ensureAutoCleanupScheduled(): void {
    if (
      !this.#isAutoCleanupAllowed ||
      this.#isAutoCleanupScheduled ||
      typeof document === 'undefined'
    ) {
      return;
    }

    if (document.body) {
      this.startAutoCleanup(document.body);
      return;
    }

    const initCleanup = () => {
      if (document.body && !this.#isAutoCleanupScheduled) this.startAutoCleanup(document.body);
      if (this.#isAutoCleanupScheduled) {
        document.removeEventListener('DOMContentLoaded', initCleanup);
      }
    };
    document.addEventListener('DOMContentLoaded', initCleanup);
    queueMicrotask(initCleanup);
  }

  /** @internal */
  enableAutoCleanup(root: CleanupRoot): void {
    if (this.#autoCleanupRoots.has(root)) return;
    if (this.#removalBatch) this.#removalBatch.invalid = true;

    this.registerShadowAncestors(root);
    const observer = getOrCreateRootObserver(root);
    const unsubscribe = observer.onNodeRemoved((node, record) => {
      if (getNodeType(node) !== 1) return;
      if (isNodeConnected(node) || this.isInObservedTree(node)) {
        // A native move into a closed root must remain reachable when its host is removed.
        this.#registerMovedShadowAncestors(node as Element);
        return;
      }
      if (this.isPreservedRemoval(node, record)) return;
      this.cleanupTree(node);
    });

    this.#autoCleanupRoots.set(root, { observer, unsubscribe });
  }

  #disableAutoCleanupFor(root: Node): void {
    const entry = this.#autoCleanupRoots.get(root);
    if (entry) {
      if (this.#removalBatch) this.#removalBatch.invalid = true;
      entry.unsubscribe();
      this.#autoCleanupRoots.delete(root);
    }
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

  #hasManagedSubtree(element: Element): boolean {
    const state = nodeStates.get(element);
    if (
      state?.record ||
      state?.shadowRoot ||
      this.#autoCleanupRoots.has(element) ||
      Element.prototype.querySelector.call(element, `.${MARK_BOUND}, .${MARK_SHADOW}`)
    ) {
      return true;
    }
    for (const host of this.#pendingShadowMarkers) {
      if (Node.prototype.contains.call(element, host)) return true;
    }
    return false;
  }

  #registerMovedShadowAncestors(element: Element): void {
    const root = Node.prototype.getRootNode.call(element);
    if (isShadowRoot(root) && this.#hasManagedSubtree(element)) this.#registerShadowChain(root);
  }

  /** Makes a managed node reachable through its containing shadow hosts. @internal */
  registerShadowAncestors(node: Node): void {
    this.#registerShadowChain(Node.prototype.getRootNode.call(node));
  }

  #registerShadowChain(initialRoot: Node): void {
    const { getRootNode } = Node.prototype;
    for (let root = initialRoot; isShadowRoot(root); root = getRootNode.call(root.host)) {
      const host = root.host;
      if (this.getShadow(host) !== root || !host.classList.contains(MARK_SHADOW)) {
        this.registerShadow(host, root);
        this.markHost(host);
      }
    }
  }

  /**
   * Adds a CSS marker, retrying in a microtask if the class write throws.
   */
  #safeMark(element: Element, className: string): void {
    try {
      element.classList.add(className);
    } catch {
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
    if (this.#pendingShadowMarkers.has(host)) return;
    if (isNodeConnected(host)) {
      this.#safeMark(host, MARK_SHADOW);
      return;
    }

    // The browser rejects attributes on a newly constructed custom element after its constructor returns.
    this.#pendingShadowMarkers.add(host);
    queueMicrotask(() => {
      this.#pendingShadowMarkers.delete(host);
      this.#safeMark(host, MARK_SHADOW);
    });
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
  #getOrCreateRecord(element: Element): { record: BindingRecord; isNew: boolean } {
    this.#ensureAutoCleanupScheduled();
    this.registerShadowAncestors(element);

    const state = this.#getState(element);
    let record = state.record;
    const isNew = !record;
    if (!record) {
      record = {};
      state.record = record;
    }
    return { record, isNew };
  }

  /** Logic: Task Aggregation @internal */
  #addCleanup(
    element: Element,
    task: CleanupTask,
    getRemovalRoots?: () => readonly Node[]
  ): () => void {
    const { record, isNew } = this.#getOrCreateRecord(element);
    record.tasks ??= new SlotBuffer<CleanupTask>();
    record.tasks.push(task);
    if (getRemovalRoots) {
      record.removalRoots ??= new Map();
      record.removalRoots.set(task, getRemovalRoots);
    }
    if (isNew) this.#safeMark(element, MARK_BOUND);
    return () => {
      if (!record.tasks?.remove(task)) return;
      record.removalRoots?.delete(task);
      if (record.tasks.size !== 0 || record.teardown) return;
      const state = nodeStates.get(element);
      if (state?.record !== record) return;
      if (state.shadowRoot) state.record = undefined;
      else nodeStates.delete(element);
      if (element.classList.contains(MARK_BOUND)) element.classList.remove(MARK_BOUND);
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
  onCleanup(
    element: Element,
    cleanupFunction: CleanupTask,
    getRemovalRoots?: () => readonly Node[]
  ): () => void {
    const selector = getSelector(element);
    return this.#addCleanup(
      element,
      (reason) => {
        try {
          cleanupFunction(reason);
        } catch (error) {
          debug.error(SYSTEM_BINDING.PREFIX, SYSTEM_BINDING.ERRORS.CLEANUP_ERROR(selector), error);
        }
      },
      getRemovalRoots
    );
  }

  /** Assigns a component-level teardown function to an element. @internal */
  setTeardown(element: Element, teardownFunction: (() => void) | undefined): void {
    const { record, isNew } = this.#getOrCreateRecord(element);
    record.teardown = teardownFunction;
    if (isNew) this.#safeMark(element, MARK_BOUND);
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
  cleanup(node: Node, reason: CleanupReason = 'dispose'): void {
    const state = nodeStates.get(node);
    this.#disableAutoCleanupFor(node);

    if (getNodeType(node) !== 1) {
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

    if (element.classList.contains(MARK_BOUND)) element.classList.remove(MARK_BOUND);

    if (record) {
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
        record.tasks.forEach((cleanupFunction) => cleanupFunction(reason));
        record.tasks.clear();
      }
      record.removalRoots?.clear();
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
  cleanupDescendants(root: Element | DocumentFragment | ShadowRoot, reason?: CleanupReason): void {
    // Markers alone cannot rule out descendants while a host marker is pending.
    if (this.#pendingShadowMarkers.size === 0) {
      if (getNodeType(root) === 1) {
        const element = root as Element;
        const hasBound = element.getElementsByClassName(MARK_BOUND).length > 0;
        const hasShadow = element.getElementsByClassName(MARK_SHADOW).length > 0;
        if (!hasBound && !hasShadow) return;
      } else if (!root.querySelector(`.${MARK_BOUND}, .${MARK_SHADOW}`)) {
        return;
      }
    }

    const nodes = root.querySelectorAll(`.${MARK_BOUND}`);

    for (const hostElement of nodes) {
      if (hostElement) {
        this.cleanup(hostElement, reason);
      }
    }

    // Optimization: Marker-based traversal
    // Instead of a full-tree walk, we jump directly to hosts known to possess
    // managed ShadowRoots to perform recursive cleanup.
    let shadowHosts: Iterable<Element> = root.querySelectorAll(`.${MARK_SHADOW}`);
    if (this.#pendingShadowMarkers.size > 0) {
      const hosts = new Set(shadowHosts);
      for (const host of this.#pendingShadowMarkers) {
        if (host !== root && Node.prototype.contains.call(root, host)) hosts.add(host);
      }
      shadowHosts = hosts;
    }
    for (const host of shadowHosts) {
      const shadowRoot = this.getShadow(host);
      if (shadowRoot) {
        this.cleanupTree(shadowRoot, reason);
      }
    }
  }

  /**
   * Performs a deep recursive cleanup of a node and all its internal subtrees (including Shadow DOM).
   * @internal
   */
  cleanupTree(node: Node, reason?: CleanupReason): void {
    const nodeType = getNodeType(node);
    if (nodeType === 1 || nodeType === 11) {
      const root = node as Element | DocumentFragment | ShadowRoot;
      this.cleanupDescendants(root, reason);

      // Constraint: Shadow DOM trees must be cleaned recursively as they are
      // isolated from standard query selectors.
      if (nodeType === 1) {
        const shadowRoot = this.getShadow(node as Element);
        if (shadowRoot) {
          this.cleanupTree(shadowRoot, reason);
        }
      }
    }
    this.cleanup(node, reason);
  }
}

/** The global instance of the BindingRegistry. */
export const registry = new BindingRegistry();

/** Adds an auto-cleanup observer without replacing existing roots. */
export const enableAutoCleanup = (root: CleanupRoot): void => registry.enableAutoCleanup(root);

/** Disconnects all auto-cleanup observers without changing jQuery patches. */
export const disableAutoCleanup = (): void => registry.disableAutoCleanup();
