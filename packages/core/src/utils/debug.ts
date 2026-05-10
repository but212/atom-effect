/**
 * @module Debug
 *
 * Responsibility:
 * Provides diagnostic utilities for development, including graph visualization,
 * infinite loop detection, and node identification.
 *
 * Design Intent:
 * Decouples diagnostic state from reactive nodes to prevent de-optimization
 * in the V8 hot-path. Uses a zero-cost replacement (ProdDebugController)
 * in production environments.
 */

import { BRAND, BRAND_MASK, DEBUG_CONFIG, DEBUG_PREFIX, IS_DEV, TYPE_BY_BRAND } from '@/constants';
import type { DebugConfig, DependencyId, NodeMetadata } from '@/types';

/** Shared no-op function to reduce memory pressure in production. @internal */
const noop = () => {};

/**
 * Role: Primary diagnostic engine used during development.
 *
 * Manages the lifecycle of debug metadata and enforces runtime constraints
 * such as infinite loop detection.
 *
 * @internal
 */
class DevDebugController implements DebugConfig {
  public enabled = true;

  /** If true, warns when a node updates too many times in one cycle. */
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  private _updateCounts = new Map<DependencyId, number>();

  /**
   * Reason: Decoupling metadata from reactive objects prevents object shape
   * changes (transitions) that could lead to V8 de-optimization.
   */
  private _registry = new Map<DependencyId, NodeMetadata>();

  /**
   * Impact: Enabling this increases memory overhead as it prevents
   * immediate GC of metadata until the node is fully collected.
   */
  public trackGraph = false;

  /**
   * Logic: Memory Management
   * Automatically purges diagnostic metadata when the associated reactive
   * node is garbage collected to prevent memory leaks in long-running dev sessions.
   */
  private _finalizer = new FinalizationRegistry((id: DependencyId) => {
    this._registry.delete(id);
    this._updateCounts.delete(id);
  });

  private _threshold = DEBUG_CONFIG.LOOP_THRESHOLD;

  private _cleanupScheduled = false;

  private _failedEvaluations = new Set<DependencyId>();
  private _failureCleanupScheduled = false;

  /**
   * Standardized warning logger for the library.
   */
  public warn(cond: boolean, msg: string): void {
    if (this.enabled && cond) {
      console.warn(`${DEBUG_PREFIX} ${msg}`);
    }
  }

  /**
   * Registers a node for lifecycle tracking.
   * Required for graph visualization and automatic cleanup.
   */
  public registerNode(node: object & { id: DependencyId }): void {
    const id = node.id;
    const entry = this._getOrCreateMetadata(node, id);

    entry.ref = new WeakRef(node);
    this._finalizer.register(node, id);
  }

  /**
   * Attaches human-readable labels and type information to a node.
   *
   * @param obj - The reactive node to label.
   * @param type - The node type (e.g., 'atom', 'computed').
   * @param id - Internal unique identifier.
   * @param customName - Optional user-provided label.
   */
  public attachDebugInfo(obj: object, type: string, id: DependencyId, customName?: string): void {
    if (!this.enabled || (customName === undefined && !this.trackGraph)) return;

    let entry = this._registry.get(id);
    if (!entry) {
      entry = { name: customName ?? `${type}_${id}`, type };
      this._registry.set(id, entry);
    } else {
      if (customName !== undefined) entry.name = customName;
      entry.type = type;
    }

    this.registerNode(obj as object & { id: DependencyId });
  }

  /**
   * Monitors update frequency to detect and warn about infinite reactive loops.
   *
   * Logic: Cycle-based Threshold
   * Increments an update counter for the given ID. A microtask is scheduled
   * to reset all counters at the end of the current execution cycle. If a
   * counter exceeds the threshold before the reset, a loop is suspected.
   */
  public trackUpdate(id: DependencyId, name?: string): void {
    if (!this.enabled || !this.warnInfiniteLoop) return;

    const counts = this._updateCounts;
    const count = (counts.get(id) || 0) + 1;
    counts.set(id, count);

    if (count > this._threshold) {
      // Logic: Warning Deduplication
      // Only warns once per cycle when the threshold is first crossed
      // to avoid flooding the console during an active loop.
      if (count === this._threshold + 1) {
        console.warn(
          `${DEBUG_PREFIX} Infinite loop detected for ${name ?? `dependency ${id}`}. ` +
            `Detected ${count} updates within a single execution scope, exceeding the threshold of ${this._threshold}.`
        );
      }
    }

    if (!this._cleanupScheduled) {
      this._cleanupScheduled = true;
      // Constraint: Must be cleared at the end of the microtask queue
      // to ensure all synchronous updates in the current tick are counted.
      queueMicrotask(this._resetUpdateCounts);
    }
  }

  private _resetUpdateCounts = (): void => {
    this._updateCounts.clear();
    this._cleanupScheduled = false;
  };

  /**
   * Logic: Warning Deduplication
   * Records evaluation failures during dirty checks. Failures are tracked
   * in a Set and cleared via microtask to ensure only one warning per
   * dependency is emitted per execution cycle.
   */
  public trackEvaluationFailure(id: DependencyId): void {
    if (!this.enabled || this._failedEvaluations.has(id)) return;

    this._failedEvaluations.add(id);
    console.warn(`${DEBUG_PREFIX} Dependency #${id} evaluation failed during dirty check.`);

    if (!this._failureCleanupScheduled) {
      this._failureCleanupScheduled = true;
      queueMicrotask(this._resetFailedEvaluations);
    }
  }

  private _resetFailedEvaluations = (): void => {
    this._failedEvaluations.clear();
    this._failureCleanupScheduled = false;
  };

  /**
   * Captures a snapshot of all active reactive nodes and their diagnostic state.
   *
   * Optimization: Performs a linear scan O(N) of the metadata registry.
   * Performance impact is proportional to the number of live reactive nodes.
   *
   * @returns An array of diagnostic records for active nodes.
   *
   * @example
   * ```typescript
   * import { debug } from '@but212/atom-effect';
   *
   * // Inspect the current state of the reactive graph
   * console.table(debug.dumpGraph());
   * ```
   */
  public dumpGraph(): Record<string, unknown>[] {
    const registry = this._registry;
    if (registry.size === 0) return [];

    const result: Record<string, unknown>[] = [];
    const counts = this._updateCounts;

    for (const [id, meta] of registry) {
      // Skip entries that have been garbage collected if graph tracking is strict.
      if (this.trackGraph && meta.ref?.deref() === undefined) {
        continue;
      }
      result.push({
        id,
        name: meta.name,
        type: meta.type,
        updateCount: counts.get(id) ?? 0,
      });
    }
    return result;
  }

  /**
   * Retrieves the human-readable name of a reactive node.
   * Fallback: Returns a generated name based on the node's type and ID.
   */
  public getDebugName(obj: object | null | undefined): string | undefined {
    if (!this.enabled || !obj) return undefined;
    const id = (obj as { id?: DependencyId }).id;
    if (id === undefined) return undefined;

    const meta = this._registry.get(id);
    if (meta) return meta.name;

    const type = this._getTypeFromBrand(obj) ?? 'unknown';
    return `${type}_${id}`;
  }

  /**
   * Retrieves the diagnostic type of a reactive node.
   */
  public getDebugType(obj: object | null | undefined): string | undefined {
    if (!this.enabled || !obj) return undefined;
    const id = (obj as { id?: DependencyId }).id;
    if (id === undefined) return undefined;

    const meta = this._registry.get(id);
    if (meta) return meta.type;

    return this._getTypeFromBrand(obj);
  }

  private _getOrCreateMetadata(obj: object, id: DependencyId): NodeMetadata {
    let entry = this._registry.get(id);
    if (!entry) {
      const type = this._getTypeFromBrand(obj) ?? 'unknown';
      entry = { name: `${type}_${id}`, type };
      this._registry.set(id, entry);
    }
    return entry;
  }

  private _getTypeFromBrand(obj: object): string | undefined {
    const brand = (obj as { [BRAND]?: number })[BRAND];
    return brand !== undefined ? TYPE_BY_BRAND[brand & BRAND_MASK] : undefined;
  }
}

/**
 * Role: Production-safe replacement for the debug controller.
 *
 * Logic: Dead-Code Elimination
 * All methods are no-ops. When bundled for production, modern minifiers
 * and JIT compilers can inline these calls or remove them entirely,
 * ensuring zero runtime overhead.
 */
const ProdDebugController: DebugConfig = {
  enabled: false,
  warnInfiniteLoop: false,
  trackGraph: false,
  warn: noop,
  registerNode: noop,
  attachDebugInfo: noop,
  trackUpdate: noop,
  dumpGraph: () => [],
  getDebugName: () => undefined,
  getDebugType: () => undefined,
  trackEvaluationFailure: noop,
};

/**
 * Global diagnostic hub for the atom-effect library.
 *
 * When to use:
 * - Debugging infinite reactive loops in development.
 * - Inspecting the active reactive graph via `dumpGraph()`.
 * - Monitoring evaluation failures during dirty checks.
 *
 * @example
 * ```typescript
 * import { debug } from '@but212/atom-effect';
 *
 * // Enable graph tracking (disabled by default due to overhead)
 * debug.trackGraph = true;
 *
 * // View all active nodes
 * console.table(debug.dumpGraph());
 * ```
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugController() : ProdDebugController;

/** @internal */
let nextId = 1;

/**
 * Logic: Stable Identification
 * Generates an internal unique ID for a reactive node. These IDs are
 * used to map metadata in the debug registry without holding strong
 * references to the nodes themselves.
 */
export const generateId = (): DependencyId => nextId++ as DependencyId;
