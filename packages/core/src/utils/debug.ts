import { DEBUG_CONFIG, IS_DEV, SMI_MAX } from '@/constants';
import { DEBUG_NAME, DEBUG_TYPE } from '@/symbols';
import type { DebugConfig, DependencyId } from '@/types';

/**
 * Debug controller implementation.
 */
class DebugController implements DebugConfig {
  public enabled = IS_DEV;
  public warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;

  public warnIf(cond: boolean, msg: string): void {
    if (!IS_DEV || !this.enabled || !cond) return;
    console.warn(`[Atom Effect] ${msg}`);
  }

  public attachDebugInfo(obj: object, type: string, id: DependencyId): void {
    if (!IS_DEV || !this.enabled) return;

    const t = obj as Record<symbol, unknown>;
    t[DEBUG_NAME] = `${type}_${id}`;
    t[DEBUG_TYPE] = type;
  }

  public getDebugName(obj: object | null | undefined): string | undefined {
    if (obj == null) return undefined;
    return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
  }

  public getDebugType(obj: object | null | undefined): string | undefined {
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
 * Generates ID within [1, SMI_MAX] range.
 */
export const generateId = (): DependencyId => {
  const id = nextId;
  nextId = (nextId % SMI_MAX) + 1;
  return id;
};
