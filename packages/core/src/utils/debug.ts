import { BRAND, BrandFlags, DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

// ── Debug Symbols ────────────────────────────────────────────────────────

/** Sentinel value used to distinguish between 'undefined' and 'not set'. */
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/** @internal */
interface NodeMetadata {
  name: string;
  type: string;
  ref?: WeakRef<object>;
}

const TYPE_BY_BRAND: Record<number, string> = {
  [BrandFlags.Atom]: 'atom',
  [BrandFlags.Computed]: 'computed',
  [BrandFlags.Effect]: 'effect',
};

const BRAND_MASK = BrandFlags.Atom | BrandFlags.Computed | BrandFlags.Effect;

const PREFIX = '[Atom Effect]';

/** Shared no-op function to reduce memory pressure in production. @internal */
const noop = () => {};

/**
 * Controller for development-time diagnostics.
 *
 * Responsibilities:
 * - Detecting infinite reactive loops.
 * - Tracking the global dependency graph.
 * - Mapping unique IDs to human-readable names.
 *
 * @internal
 */
class DevDebugController implements DebugConfig {
  public enabled = true;

  /** If true, warns when a node updates too many times in one cycle. */
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  private _updateCounts = new Map<DependencyId, number>();

  /**
   * External storage for metadata.
   * Reason: Keeps the reactive objects 'thin' and prevents de-optimization.
   */
  private _registry = new Map<DependencyId, NodeMetadata>();

  /**
   * Enables full graph inspection via `dumpGraph()`.
   * Warning: High overhead. Only enable during deep debugging.
   */
  public trackGraph = false;

  /** Automatically purges metadata when a reactive node is garbage collected. */
  private _finalizer = new FinalizationRegistry((id: DependencyId) => {
    this._registry.delete(id);
    this._updateCounts.delete(id);
  });

  private _threshold = DEBUG_CONFIG.LOOP_THRESHOLD;

  private _cleanupScheduled = false;

  private _failedEvaluations = new Set<DependencyId>();
  private _failureCleanupScheduled = false;

  public warn(cond: boolean, msg: string): void {
    if (this.enabled && cond) {
      console.warn(`${PREFIX} ${msg}`);
    }
  }

  /**
   * Tracks a live node in the registry for graph visualization.
   */
  public registerNode(node: object & { id: DependencyId }): void {
    const id = node.id;
    const entry = this._getOrCreateMetadata(node, id);

    entry.ref = new WeakRef(node);
    this._finalizer.register(node, id);
  }

  /**
   * Links internal IDs to labels and types.
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

    // Always register for finalization if we are keeping metadata to avoid memory leaks.
    // This also ensures entry.ref is populated for consistent dumpGraph() behavior.
    this.registerNode(obj as object & { id: DependencyId });
  }

  /**
   * Monitors update frequency to prevent UI hangs.
   *
   * Logic: Counts updates per node and resets via microtask.
   * If a node exceeds the threshold before the microtask runs, a loop is suspected.
   */
  public trackUpdate(id: DependencyId, name?: string): void {
    if (!this.enabled || !this.warnInfiniteLoop) return;

    const counts = this._updateCounts;
    const count = (counts.get(id) || 0) + 1;
    counts.set(id, count);

    if (count > this._threshold) {
      // Only warn once per cycle to prevent console spam.
      if (count === this._threshold + 1) {
        console.warn(
          `${PREFIX} Infinite loop detected for ${name ?? `dependency ${id}`}. ` +
            `Detected ${count} updates within a single execution scope, exceeding the threshold of ${this._threshold}.`
        );
      }
    }

    if (!this._cleanupScheduled) {
      this._cleanupScheduled = true;
      // Task scheduled at the end of the current execution cycle.
      queueMicrotask(this._resetUpdateCounts);
    }
  }

  private _resetUpdateCounts = (): void => {
    this._updateCounts.clear();
    this._cleanupScheduled = false;
  };

  /**
   * Logic: Warning Deduplication
   * Records evaluation failures during dirty checks and warns once per dependency per cycle.
   */
  public trackEvaluationFailure(id: DependencyId): void {
    if (!this.enabled || this._failedEvaluations.has(id)) return;

    this._failedEvaluations.add(id);
    console.warn(`${PREFIX} Dependency #${id} evaluation failed during dirty check.`);

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
   * Captures the current state of all active reactive nodes.
   *
   * Performance: O(N) where N is the number of live nodes.
   * Use sparingly.
   */
  public dumpGraph(): Record<string, unknown>[] {
    const registry = this._registry;
    if (registry.size === 0) return [];

    const result: Record<string, unknown>[] = [];
    const counts = this._updateCounts;

    for (const [id, meta] of registry) {
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

  public getDebugName(obj: object | null | undefined): string | undefined {
    if (!this.enabled || !obj) return undefined;
    const id = (obj as { id?: DependencyId }).id;
    if (id === undefined) return undefined;

    const meta = this._registry.get(id);
    if (meta) return meta.name;

    const type = this._getTypeFromBrand(obj) ?? 'unknown';
    return `${type}_${id}`;
  }

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
 * Inert implementation for production.
 * Replaces all logic with no-ops to ensure the JIT compiler can optimize them away.
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
 * Global diagnostic hub.
 *
 * @example
 * ```typescript
 * import { debug } from '@but212/atom-effect';
 *
 * // View all active nodes in the console
 * console.table(debug.dumpGraph());
 * ```
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugController() : ProdDebugController;

/** @internal */
let nextId = 1;

/**
 * Generates an internal unique ID for a reactive node.
 */
export const generateId = (): DependencyId => nextId++ as DependencyId;
