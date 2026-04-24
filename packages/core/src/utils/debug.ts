import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

/**
 * Global symbols used for attaching internal debug metadata to reactive objects.
 * These symbols prevent property name collisions with user-provided data.
 *
 * When to use:
 * - To inspect the internal state of atoms or effects during runtime.
 * - To build diagnostic tools or custom loggers that require access to node metadata.
 */

/** A symbol representing the human-readable identifier of a reactive node. */
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
/** A symbol representing the unique internal monotonic ID of a reactive node. */
export const DEBUG_ID = Symbol('AtomEffect.Id');
/** A symbol representing the category type of a reactive node (e.g., 'atom', 'effect'). */
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
/** A sentinel value used to indicate the absence of a default value in reactive nodes. */
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/** @internal */
interface DebugMetadata {
  [DEBUG_NAME]?: string;
  [DEBUG_ID]?: DependencyId;
  [DEBUG_TYPE]?: string;
}

/** The prefix used for all console messages dispatched by the library. */
const PREFIX = '[Atom Effect]';

/**
 * A shared no-op function used in production to minimize memory usage and call overhead.
 * @internal
 */
const noop = () => {};

/**
 * A controller providing diagnostic and monitoring capabilities in development environments.
 *
 * The `DevDebugController` facilitates graph tracking, infinite loop detection,
 * and metadata management, ensuring that internal state is inspectable without
 * affecting production performance.
 *
 * @internal
 */
class DevDebugController implements DebugConfig {
  /** Indicates whether debugging features are currently active. */
  public enabled = true;

  /** Indicates whether infinite loop warnings should be dispatched. */
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  private _updateCounts = new Map<DependencyId, number>();

  /**
   * Logic: Maintains a registry of active nodes using `WeakRef`.
   * This allows the registry to track nodes for graph visualization while
   * permitting garbage collection of nodes that are no longer referenced by the user.
   */
  private _nodeRegistry = new Map<DependencyId, WeakRef<object>>();

  private _threshold = DEBUG_CONFIG.LOOP_THRESHOLD;

  private _cleanupScheduled = false;

  /**
   * Logs a warning to the console if the provided condition evaluates to true.
   *
   * @param cond - The condition to validate.
   * @param msg - The warning message to display.
   *
   * @example
   * ```typescript
   * debug.warn(count > 100, 'Threshold exceeded');
   * ```
   */
  public warn = (cond: boolean, msg: string): void => {
    if (this.enabled && cond) console.warn(`${PREFIX} ${msg}`);
  };

  /**
   * Registers a reactive node within the internal graph registry.
   *
   * @param node - The node instance to register.
   */
  public registerNode = (node: object & { id: DependencyId }): void => {
    this._nodeRegistry.set(node.id, new WeakRef(node));
  };

  /**
   * Attaches technical metadata to a reactive object.
   *
   * Logic: Performs direct property assignment using Symbols to ensure that
   * metadata is attached with minimal overhead compared to `Object.defineProperty`.
   *
   * @param obj - The target object to augment.
   * @param type - The node category (e.g., 'atom', 'computed').
   * @param id - The unique identifier for the node.
   * @param customName - An optional user-provided label.
   */
  public attachDebugInfo = (
    obj: object,
    type: string,
    id: DependencyId,
    customName?: string
  ): void => {
    if (!this.enabled) return;

    const meta = obj as DebugMetadata;
    meta[DEBUG_NAME] = customName ?? `${type}_${id}`;
    meta[DEBUG_ID] = id;
    meta[DEBUG_TYPE] = type;

    this.registerNode(obj as { id: DependencyId });
  };

  /**
   * Tracks an update to a specific node and monitors for infinite loops.
   *
   * Logic: Increments an update counter for the specified ID. If the counter
   * exceeds the defined threshold within a single microtask execution cycle,
   * a warning is dispatched.
   *
   * @param id - The unique identifier of the updating node.
   * @param name - The display name of the node for error context.
   */
  public trackUpdate = (id: DependencyId, name?: string): void => {
    if (!this.enabled || !this.warnInfiniteLoop) return;

    const counts = this._updateCounts;
    const count = (counts.get(id) ?? 0) + 1;

    if (count > this._threshold) {
      this.warn(
        true,
        `Infinite loop detected for ${name ?? `dependency ${id}`}. ` +
          `Detected ${count} updates within a single execution scope, exceeding the threshold of ${this._threshold}.`
      );
    } else {
      counts.set(id, count);
    }

    if (!this._cleanupScheduled) {
      this._cleanupScheduled = true;
      // Logic: Flush update counts at the end of the current microtask to reset loop detection.
      queueMicrotask(() => {
        this._updateCounts.clear();
        this._cleanupScheduled = false;
      });
    }
  };

  /**
   * Generates a snapshot representing the current state of the reactive graph.
   *
   * Caution: This operation has O(N) complexity relative to the total number
   * of registered nodes and should only be used for diagnostic purposes.
   *
   * @returns An array of metadata objects for all currently live nodes.
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
        // Optimization: Lazily clean up registry entries for nodes that have been garbage collected.
        this._nodeRegistry.delete(id);
        this._updateCounts.delete(id);
      }
    }
    return result;
  };

  /**
   * Retrieves the human-readable name attached to a reactive object.
   *
   * @param obj - The object to inspect.
   * @returns The debug name or undefined.
   */
  public getDebugName = (obj: object | null | undefined): string | undefined => {
    if (obj == null) return undefined;
    return (obj as DebugMetadata)[DEBUG_NAME];
  };

  /**
   * Retrieves the node type identifier attached to a reactive object.
   *
   * @param obj - The object to inspect.
   * @returns The type string or undefined.
   */
  public getDebugType = (obj: object | null | undefined): string | undefined => {
    if (obj == null) return undefined;
    return (obj as DebugMetadata)[DEBUG_TYPE];
  };
}

/**
 * An inert implementation of the debug controller for production environments.
 *
 * Optimization: All methods are replaced with no-ops to ensure zero runtime
 * overhead when debugging is disabled.
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
 *
 * When to use:
 * - To enable or disable diagnostic features at runtime.
 * - To adjust thresholds for loop detection during development or testing.
 *
 * @example
 * ```typescript
 * import { debug } from '@but212/atom-effect';
 *
 * // Enable detailed loop warnings in a test environment.
 * debug.enabled = true;
 * debug.warnInfiniteLoop = true;
 * ```
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugController() : ProdDebugController;

/**
 * Internal counter used to generate unique dependency identifiers.
 * @internal
 */
let nextId = 1;

/**
 * Generates a unique, monotonically increasing integer identifier.
 *
 * Optimization: Uses a bitwise OR with 0 to ensure the result is coerced to
 * a 32-bit integer (SMI), which optimizes property access and memory layout in V8.
 *
 * @returns A unique DependencyId.
 */
export const generateId = (): DependencyId => (nextId++ | 0) as DependencyId;
