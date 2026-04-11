import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

/**
 * Debug symbols used to store metadata on objects without interfering with their normal properties.
 * These are exported to allow external inspection or custom debugging tools.
 */

/** Symbol used to store and retrieve a human-readable name for an atom or effect. */
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
/** Symbol used to store and retrieve the unique internal ID. */
export const DEBUG_ID = Symbol('AtomEffect.Id');
/** Symbol used to store and retrieve the type identifier (e.g., 'atom', 'effect'). */
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
/** Symbol used as a sentinel value to indicate that no default value was provided. */
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/** Log prefix for Atom Effect console messages. */
const PREFIX = '[Atom Effect]';

/**
 * Optimized Debug controller implementation for development environments.
 * Provides active monitoring, logging, and inspection capabilities.
 *
 * @internal
 * @implements {DebugConfig}
 */
class DevDebugController implements DebugConfig {
  /** Whether debugging features are currently active. */
  public enabled = true;

  /** Whether to warn when a potential infinite loop is detected. */
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  /** Tracks the number of updates per dependency within a single execution scope. */
  private _updateCounts = new Map<DependencyId, number>();

  /**
   * Weakly references registered nodes to allow garbage collection while maintaining
   * a list for graph dumping.
   */
  private _nodeRegistry = new Map<DependencyId, WeakRef<object>>();

  /** Threshold for triggering an infinite loop warning. */
  private _threshold = DEBUG_CONFIG.LOOP_THRESHOLD;

  /** Prevents redundant cleanup scheduling. */
  private _cleanupScheduled = false;

  /**
   * Logs a warning message if the condition is met and debugging is enabled.
   *
   * @param cond - The condition to check.
   * @param msg - The message to log if the condition is true.
   */
  public warn = (cond: boolean, msg: string): void => {
    if (this.enabled && cond) console.warn(`${PREFIX} ${msg}`);
  };

  /**
   * Registers a node in the internal registry for tracking and graph generation.
   * Uses WeakRef to prevent memory leaks.
   *
   * @param node - The object/node to register, must have a unique DependencyId.
   */
  public registerNode = (node: object & { id: DependencyId }): void => {
    this._nodeRegistry.set(node.id, new WeakRef(node));
  };

  /**
   * Attaches debug metadata to a runtime object.
   *
   * @param obj - The object to attach info to.
   * @param type - The type of the node (e.g., 'atom', 'selector', 'effect').
   * @param id - The unique internal identifier.
   * @param customName - Optional user-defined name for easier identification.
   */
  public attachDebugInfo = (
    obj: object,
    type: string,
    id: DependencyId,
    customName?: string
  ): void => {
    if (!this.enabled) return;

    Object.defineProperties(obj, {
      [DEBUG_NAME]: { value: customName ?? `${type}_${id}`, configurable: true },
      [DEBUG_ID]: { value: id, configurable: true },
      [DEBUG_TYPE]: { value: type, configurable: true },
    });

    this.registerNode(obj as { id: DependencyId });
  };

  /**
   * Tracks an update to a dependency and checks for infinite loops.
   * Counts are automatically reset at the end of the current microtask.
   *
   * @param id - The unique identifier of the dependency being updated.
   * @param name - An optional display name for the warning message.
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
      // Reset counts at the end of the current microtask to prevent memory leaks
      // and false positives across different execution cycles.
      Promise.resolve().then(() => {
        this._updateCounts.clear();
        this._cleanupScheduled = false;
      });
    }
  };

  /**
   * Generates a snapshot of the current reactive graph.
   * Automatically prunes dead references from the registry.
   *
   * @returns An array of debug info objects for all currently alive nodes.
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
        this._nodeRegistry.delete(id);
        this._updateCounts.delete(id);
      }
    }
    return result;
  };

  /**
   * Retrieves the debug name from an object if it exists.
   *
   * @param obj - the object to inspect.
   * @returns The human-readable name or undefined.
   */
  public getDebugName = (obj: object | null | undefined): string | undefined => {
    if (!obj) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
  };

  /**
   * Retrieves the debug type from an object if it exists.
   *
   * @param obj - the object to inspect.
   * @returns The type identifier or undefined.
   */
  public getDebugType = (obj: object | null | undefined): string | undefined => {
    if (!obj) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_TYPE] as string | undefined;
  };
}

/**
 * Inert implementation of the Debug controller for production environments.
 * All operations are no-ops to ensure maximum performance and minimal bundle size.
 *
 * @internal
 * @implements {DebugConfig}
 */
const ProdDebugController: DebugConfig = {
  enabled: false,
  warnInfiniteLoop: false,
  warn: () => {},
  registerNode: () => {},
  attachDebugInfo: () => {},
  trackUpdate: () => {},
  dumpGraph: () => [],
  getDebugName: () => undefined,
  getDebugType: () => undefined,
};

/**
 * The global debug singleton instance.
 * Automatically switches between development and production implementations
 * based on the environment configuration (IS_DEV).
 *
 * In production, this becomes a lightweight object with empty methods,
 * allowing engines to inline or ignore calls, effectively providing zero overhead.
 *
 * @public
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugController() : ProdDebugController;

/**
 * Internal counter for generating unique DependencyIds.
 * @private
 */
let nextId = 1;

/**
 * Generates a unique, monotonically increasing integer ID.
 * Casts to DependencyId type for internal type safety.
 *
 * @returns A fresh DependencyId.
 * @public
 */
export const generateId = (): DependencyId => (nextId++ | 0) as DependencyId;
