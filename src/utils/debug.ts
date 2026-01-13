import { DEBUG_CONFIG } from '@/constants';
import { ComputedError } from '@/errors/errors';
import type { DebugConfig, Dependency } from '@/types';

/** Symbol for debug display name on reactive objects */
export const DEBUG_NAME: unique symbol = Symbol('debugName');

/** Symbol for unique identifier on reactive objects */
export const DEBUG_ID: unique symbol = Symbol('id');

/** Symbol for type discriminator ('atom' | 'computed' | 'effect') */
export const DEBUG_TYPE: unique symbol = Symbol('type');

/** Sentinel to distinguish "no default" from explicit `undefined` */
export const NO_DEFAULT_VALUE: unique symbol = Symbol('noDefaultValue');

/** Type guard for objects with dependencies array */
function hasDependencies(obj: Dependency): obj is Dependency & { dependencies: Dependency[] } {
  return 'dependencies' in obj && Array.isArray((obj as { dependencies: unknown }).dependencies);
}

let globalCheckEpoch = 0;

/** Internal recursive checker for circular dependency detection */
function checkCircularInternal(dep: Dependency, current: object, epoch: number): void {
  if (dep._visitedEpoch === epoch) {
    return;
  }
  dep._visitedEpoch = epoch;

  if (dep === current) {
    throw new ComputedError('Indirect circular dependency detected');
  }

  if (hasDependencies(dep)) {
    const deps = dep.dependencies;
    for (let i = 0; i < deps.length; i++) {
      const child = deps[i];
      if (child) checkCircularInternal(child, current, epoch);
    }
  }
}

/**
 * Debug utilities for development-time dependency tracking and circular detection.
 * Most features only active when `NODE_ENV === 'development'`.
 */
export const debug: DebugConfig = {
  enabled:
    typeof process !== 'undefined' && (process as NodeJS.Process).env?.NODE_ENV === 'development',

  maxDependencies: DEBUG_CONFIG.MAX_DEPENDENCIES,

  warnInfiniteLoop: DEBUG_CONFIG.WARN_INFINITE_LOOP,

  warn(condition: boolean, message: string): void {
    if (this.enabled && condition) {
      console.warn(`[Atom Effect] ${message}`);
    }
  },

  /**
   * Checks for circular dependencies.
   * Direct check runs always; indirect check only in dev mode.
   * @throws {ComputedError} When circular dependency detected
   */
  checkCircular(dep: Dependency, current: object): void {
    if (dep === current) {
      throw new ComputedError('Direct circular dependency detected');
    }

    if (!this.enabled) {
      return;
    }

    globalCheckEpoch++;
    checkCircularInternal(dep, current, globalCheckEpoch);
  },

  attachDebugInfo(obj: object, type: string, id: number): void {
    if (!this.enabled) {
      return;
    }

    const target = obj as Record<symbol, unknown>;
    target[DEBUG_NAME] = `${type}_${id}`;
    target[DEBUG_ID] = id;
    target[DEBUG_TYPE] = type;
  },

  getDebugName(obj: object | null | undefined): string | undefined {
    if (obj != null && DEBUG_NAME in obj) {
      return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
    }
    return undefined;
  },

  getDebugType(obj: object | null | undefined): string | undefined {
    if (obj != null && DEBUG_TYPE in obj) {
      return (obj as Record<symbol, unknown>)[DEBUG_TYPE] as string | undefined;
    }
    return undefined;
  },
};

let nextId = 1;

/** Generates a unique numeric ID for reactive objects */
export const generateId = (): number => nextId++;
