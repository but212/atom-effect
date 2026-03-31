import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import type { DebugConfig, DependencyId } from '@/types';

// Debug symbols
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
export const DEBUG_ID = Symbol('AtomEffect.Id');
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/**
 * Debug controller implementation.
 */
class DebugController implements DebugConfig {
  public enabled = IS_DEV;
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  public warn(cond: boolean, msg: string): void {
    if (!IS_DEV || !this.enabled || !cond) return;
    console.warn(`[Atom Effect] ${msg}`);
  }

  public attachDebugInfo(obj: object, type: string, id: DependencyId): void {
    if (!IS_DEV || !this.enabled) return;

    const t = obj as Record<symbol, unknown>;
    t[DEBUG_NAME] = `${type}_${id}`;
    t[DEBUG_ID] = id;
    t[DEBUG_TYPE] = type;
  }

  public getDebugName(obj: object | null): string | undefined {
    if (obj == null) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
  }

  public getDebugType(obj: object | null): string | undefined {
    if (obj == null) return undefined;
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
 * Generates ID.
 */
export const generateId = (): DependencyId => nextId++ | 0;
