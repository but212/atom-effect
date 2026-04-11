import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

// Debug symbols
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
export const DEBUG_ID = Symbol('AtomEffect.Id');
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

const PREFIX = '[Atom Effect]';

/**
 * Optimized Debug controller implementation for development.
 */
class DevDebugController implements DebugConfig {
  public enabled = true;
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  private _updateCounts = new Map<DependencyId, number>();
  private _nodeRegistry = new Map<DependencyId, WeakRef<object>>();
  private _threshold = DEBUG_CONFIG.LOOP_THRESHOLD;

  public warn = (cond: boolean, msg: string): void => {
    if (this.enabled && cond) console.warn(`${PREFIX} ${msg}`);
  };

  public registerNode = (node: object & { id: DependencyId }): void => {
    this._nodeRegistry.set(node.id, new WeakRef(node));
  };

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

  public trackUpdate = (id: DependencyId, name?: string): void => {
    if (!this.enabled || !this.warnInfiniteLoop) return;

    const counts = this._updateCounts;
    const count = (counts.get(id) ?? 0) + 1;

    if (count > this._threshold) {
      this.warn(
        true,
        `Infinite loop detected for ${name ?? `dependency ${id}`}. Over ${this._threshold} updates in a single execution scope.`
      );
      counts.delete(id);
      if (counts.size > 1000) counts.clear();
    } else {
      counts.set(id, count);
    }
  };

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
      }
    }
    return result;
  };

  public getDebugName = (obj: object | null | undefined): string | undefined => {
    if (!obj) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
  };

  public getDebugType = (obj: object | null | undefined): string | undefined => {
    if (!obj) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_TYPE] as string | undefined;
  };
}

/**
 * Inert implementation for production.
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
 * Global debug controller singleton.
 * Swaps between Dev and Prod implementations for zero overhead in production.
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugController() : ProdDebugController;

/**
 * ID counter.
 */
let nextId = 1;

/**
 * Generates monotonically increasing integer IDs.
 */
export const generateId = (): DependencyId => (nextId++ | 0) as DependencyId;
