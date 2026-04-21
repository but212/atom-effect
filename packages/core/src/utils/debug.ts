import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

/**
 * Debug symbols for metadata attachment.
 * These allow attaching internal tracking data to user-provided objects without
 * polluting the public property namespace.
 *
 * Use these when:
 * - Direct inspection of runtime objects is required.
 * - Building custom devtools or logging utilities.
 *
 * @public
 */

/** Symbol for the human-readable identifier of a dependency. */
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
/** Symbol for the unique internal monotonic ID. */
export const DEBUG_ID = Symbol('AtomEffect.Id');
/** Symbol for the entity category (e.g., 'atom', 'effect'). */
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
/** Sentinel value for missing default values in reactive nodes. */
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/** @internal */
interface DebugMetadata {
  [DEBUG_NAME]?: string;
  [DEBUG_ID]?: DependencyId;
  [DEBUG_TYPE]?: string;
}

/** Log prefix for Atom Effect console messages. */
const PREFIX = '[Atom Effect]';

/** Shared no-op function to reduce memory footprint and call overhead in production. */
const noop = () => {};

/**
 * Optimized Debug controller implementation for development environments.
 * Provides active monitoring, logging, and inspection capabilities.
 *
 * @internal
 * @implements {DebugConfig}
 */
class DevDebugController implements DebugConfig {
  public enabled = true;

  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  private _updateCounts = new Map<DependencyId, number>();

  /**
   * Weakly references registered nodes to allow garbage collection while maintaining
   * a list for graph dumping.
   */
  private _nodeRegistry = new Map<DependencyId, WeakRef<object>>();

  private _threshold = DEBUG_CONFIG.LOOP_THRESHOLD;

  private _cleanupScheduled = false;

  /**
   * Logs a warning message if the condition is met and debugging is enabled.
   *
   * @param cond - The condition to evaluate.
   * @param msg - The message to log when the condition is truthy.
   *
   * @example
   * ```typescript
   * debug.warn(count > 100, 'Update cycle threshold exceeded');
   * ```
   */
  public warn = (cond: boolean, msg: string): void => {
    if (this.enabled && cond) console.warn(`${PREFIX} ${msg}`);
  };

  /**
   * Registers a node for graph tracking.
   *
   * Optimization: Uses WeakRef to allow garbage collection of unused nodes
   * while still supporting graph visualization tools until collection.
   *
   * @param node - The reactive node to track.
   */
  public registerNode = (node: object & { id: DependencyId }): void => {
    this._nodeRegistry.set(node.id, new WeakRef(node));
  };

  /**
   * Attaches debug metadata to a runtime object.
   *
   * When to use:
   * - During initialization of new atoms or effects.
   *
   * Optimization: Performs direct property assignment instead of using
   * `Object.defineProperty` for significantly higher performance in hot paths.
   *
   * @param obj - target object to augment.
   * @param type - node category (atom/effect/etc).
   * @param id - unique identifier.
   * @param customName - optional user-provided label.
   */
  public attachDebugInfo = (
    obj: object,
    type: string,
    id: DependencyId,
    customName?: string
  ): void => {
    if (!this.enabled) return;

    // Optimization: SMI (Small Integer) optimization and direct symbol access
    // provide the fastest possible metadata attachment in V8.
    const meta = obj as DebugMetadata;
    meta[DEBUG_NAME] = customName ?? `${type}_${id}`;
    meta[DEBUG_ID] = id;
    meta[DEBUG_TYPE] = type;

    this.registerNode(obj as { id: DependencyId });
  };

  /**
   * Tracks an update to a dependency and checks for infinite loops.
   *
   * Complexity: O(1) tracking using a shared Map and microtask cleanup.
   *
   * @param id - The identifier of the updating dependency.
   * @param name - Display name for warning context.
   */
  public trackUpdate = (id: DependencyId, name?: string): void => {
    if (!this.enabled || !this.warnInfiniteLoop) return;

    const counts = this._updateCounts;
    const count = (counts.get(id) ?? 0) + 1;

    if (count > this._threshold) {
      this.warn(
        true,
        `Infinite loop detected for ${name ?? `dependency ${id}`}. Over ${this._threshold} updates in a single execution scope.`
      );
    } else {
      counts.set(id, count);
    }

    if (!this._cleanupScheduled) {
      this._cleanupScheduled = true;
      // Logic: Flush update counts at the end of the current microtask to reset loop detection
      // for the next execution cycle without requiring manual teardown.
      queueMicrotask(() => {
        this._updateCounts.clear();
        this._cleanupScheduled = false;
      });
    }
  };

  /**
   * Generates a snapshot of the current reactive graph.
   *
   * Caution: This operation is O(N) where N is the total number of registered nodes.
   * Should only be used for debugging/visualization, never in performance-critical code.
   *
   * @returns Array of debug info for all live nodes.
   */
  public dumpGraph = (): Record<string, unknown>[] => {
    const result: Record<string, unknown>[] = [];
    for (const [id, ref] of this._nodeRegistry) {
      const node = ref.deref();
      if (node) {
        result.push({
          id,
          name: this.getDebugName(node),
          type: this.getDebugType(node),
          updateCount: this._updateCounts.get(id) ?? 0,
        });
      } else {
        // Optimization: Lazy cleanup of collected nodes during graph traversal.
        this._nodeRegistry.delete(id);
        this._updateCounts.delete(id);
      }
    }
    return result;
  };

  /**
   * @param obj - the object to inspect.
   * @returns The human-readable name or undefined.
   *
   * @example
   * ```typescript
   * const name = debug.getDebugName(myAtom);
   * ```
   */
  public getDebugName = (obj: object | null | undefined): string | undefined => {
    if (obj == null) return undefined;
    return (obj as DebugMetadata)[DEBUG_NAME];
  };

  /**
   * @param obj - the object to inspect.
   * @returns The type identifier or undefined.
   *
   * @example
   * ```typescript
   * const type = debug.getDebugType(myAtom); // 'atom'
   * ```
   */
  public getDebugType = (obj: object | null | undefined): string | undefined => {
    if (obj == null) return undefined;
    return (obj as DebugMetadata)[DEBUG_TYPE];
  };
}

/**
 * Inert implementation of the Debug controller for production environments.
 * All operations are no-ops using shared handlers for minimal overhead.
 *
 * @internal
 * @implements {DebugConfig}
 */
const ProdDebugController: DebugConfig = {
  enabled: false,
  warnInfiniteLoop: false,
  warn: noop,
  registerNode: noop,
  attachDebugInfo: noop,
  trackUpdate: noop,
  dumpGraph: () => [],
  getDebugName: () => undefined,
  getDebugType: () => undefined,
};

/**
 * The global debug singleton instance.
 * Switches between `DevDebugController` (development) and `ProdDebugController` (production).
 *
 * @example
 * ```typescript
 * // Enable detailed loop warnings in a test environment
 * debug.enabled = true;
 * debug.warnInfiniteLoop = true;
 * ```
 *
 * @public
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugController() : ProdDebugController;

/**
 * Internal counter for generating unique DependencyIds.
 * @internal
 */
let nextId = 1;

/**
 * Generates a unique, monotonically increasing integer ID.
 *
 * Optimization: Uses bitwise OR with 0 to coerce the number to a 32-bit integer (SMI),
 * which is more efficient in V8's hidden class transitions and arithmetic.
 *
 * @returns A fresh DependencyId.
 *
 * @example
 * ```typescript
 * const id = generateId();
 * ```
 *
 * @public
 */
export const generateId = (): DependencyId => (nextId++ | 0) as DependencyId;
