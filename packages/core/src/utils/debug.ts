import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import { ComputedError } from '@/errors/errors';
import type { DebugConfig, Dependency, DependencyId } from '@/types';

// Debug symbols
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
export const DEBUG_ID = Symbol('AtomEffect.Id');
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/**
 * Debug controller.
 */
export const debug: DebugConfig = {
  // Dev mode flag
  enabled: IS_DEV,

  warnInfiniteLoop: DEBUG_CONFIG.WARN_INFINITE_LOOP,

  warn(cond, msg) {
    if (IS_DEV && this.enabled && cond) {
      console.warn(`[Atom Effect] ${msg}`);
    }
  },

  checkCircular(dep, current) {
    if (dep === current) {
      throw new ComputedError('Direct circular dependency detected');
    }
  },

  attachDebugInfo(obj, type, id) {
    if (!IS_DEV || !this.enabled) return;

    const t = obj as Record<symbol, unknown>;
    t[DEBUG_NAME] = `${type}_${id}`;
    t[DEBUG_ID] = id;
    t[DEBUG_TYPE] = type;
  },

  getDebugName: (obj) =>
    (obj as Record<symbol, unknown> | null)?.[DEBUG_NAME] as string | undefined,

  getDebugType: (obj) =>
    (obj as Record<symbol, unknown> | null)?.[DEBUG_TYPE] as string | undefined,
};

/**
 * ID counter.
 */
let nextId = 1;

/**
 * Generates ID.
 */
export const generateId = (): DependencyId => nextId++;
