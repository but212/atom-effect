import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

// Debug symbols
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
export const DEBUG_ID = Symbol('AtomEffect.Id');
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

const PREFIX = '[Atom Effect]';
const LOOP_THRESHOLD = 100;

/**
 * Optimized Debug controller.
 */
class DebugController implements DebugConfig {
  public enabled = IS_DEV;
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  /**
   * Internal tracker for updates to detect loops.
   * Only allocated in development to save memory in production.
   */
  private _updateCounts: Map<DependencyId, number> | null = IS_DEV ? new Map() : null;

  public warn(cond: boolean, msg: string): void {
    // Early exit for production performance
    if (!IS_DEV || !this.enabled || !cond) return;
    console.warn(`${PREFIX} ${msg}`);
  }

  public attachDebugInfo(obj: object, type: string, id: DependencyId, customName?: string): void {
    if (!IS_DEV || !this.enabled) return;

    // Define debug metadata as non-enumerable to avoid polluting iteration/serialization.
    Object.defineProperties(obj, {
      [DEBUG_NAME]: {
        value: customName ?? `${type}_${id}`,
        configurable: true,
      },
      [DEBUG_ID]: {
        value: id,
        configurable: true,
      },
      [DEBUG_TYPE]: {
        value: type,
        configurable: true,
      },
    });
  }

  public trackUpdate(id: DependencyId): void {
    const counts = this._updateCounts;
    if (!IS_DEV || !this.enabled || !this.warnInfiniteLoop || !counts) return;

    const count = (counts.get(id) ?? 0) + 1;

    if (count > LOOP_THRESHOLD) {
      this.warn(
        true,
        `Infinite loop detected for dependency ${id}. Over ${LOOP_THRESHOLD} updates in a single execution scope.`
      );
      counts.delete(id);

      // Heuristic to prevent memory leak in DEV if many unique IDs are tracked
      if (counts.size > 1000) counts.clear();
    } else {
      counts.set(id, count);
    }
  }

  public getDebugName(obj: object | null | undefined): string | undefined {
    if (!obj) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
  }

  public getDebugType(obj: object | null | undefined): string | undefined {
    if (!obj) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_TYPE] as string | undefined;
  }
}

/**
 * Global debug controller singleton.
 */
export const debug: DebugConfig = new DebugController();

/**
 * ID counter.
 */
let nextId = 1;

/**
 * Generates monotonically increasing integer IDs.
 */
export const generateId = (): DependencyId => (nextId++ | 0) as DependencyId;
