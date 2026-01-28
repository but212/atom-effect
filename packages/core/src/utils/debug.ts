import { DEBUG_CONFIG } from '@/constants';
import { ComputedError } from '@/errors/errors';
import type { DebugConfig, Dependency, DependencyId } from '@/types';

export const DEBUG_NAME = Symbol('debugName');
export const DEBUG_ID = Symbol('id');
export const DEBUG_TYPE = Symbol('type');
export const NO_DEFAULT_VALUE = Symbol('noDefaultValue');

const hasDeps = (o: Dependency): o is Dependency & { dependencies: Dependency[] } =>
  'dependencies' in o && Array.isArray((o as { dependencies: unknown }).dependencies);

function checkCircularInternal(dep: Dependency, current: object, visited: Set<number>): void {
  if (visited.has(dep.id)) return;
  visited.add(dep.id);

  if (dep === current) throw new ComputedError('Indirect circular dependency detected');
  if (hasDeps(dep)) {
    const deps = dep.dependencies;
    for (let i = 0; i < deps.length; i++) {
      if (deps[i]) checkCircularInternal(deps[i]!, current, visited);
    }
  }
}

/**
 * Global debug configuration and utility methods.
 * Controls debug mode, dependency tracking limits, and circular dependency checks.
 */
export const debug: DebugConfig = {
  enabled:
    typeof process !== 'undefined' && (process as NodeJS.Process).env?.NODE_ENV === 'development',
  maxDependencies: DEBUG_CONFIG.MAX_DEPENDENCIES,
  warnInfiniteLoop: DEBUG_CONFIG.WARN_INFINITE_LOOP,

  warn(cond, msg) {
    if (this.enabled && cond) console.warn(`[Atom Effect] ${msg}`);
  },

  checkCircular(dep, current) {
    if (dep === current) throw new ComputedError('Direct circular dependency detected');
    if (this.enabled) checkCircularInternal(dep, current, new Set());
  },

  attachDebugInfo(obj, type, id) {
    if (!this.enabled) return;
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

let nextId = 1;
export const generateId = () => nextId++ as DependencyId;
