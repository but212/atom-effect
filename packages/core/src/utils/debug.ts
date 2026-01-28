import { DEBUG_CONFIG, IS_DEV } from '@/constants';
import { ComputedError } from '@/errors/errors';
import type { DebugConfig, Dependency, DependencyId } from '@/types';

// Symbols are used to attach metadata to objects without polluting their public enumerable keys.
// This keeps the runtime clean while allowing our tools to inspect internal state.
export const DEBUG_NAME = Symbol('AtomEffect.DebugName');
export const DEBUG_ID = Symbol('AtomEffect.Id');
export const DEBUG_TYPE = Symbol('AtomEffect.Type');
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/**
 * Type guard to check if a valid dependency object has a list of dependencies.
 * Used for graph traversal.
 */
const hasDeps = (o: Dependency): o is Dependency & { dependencies: Dependency[] } =>
  'dependencies' in o && Array.isArray((o as { dependencies: unknown }).dependencies);

/**
 * Recursive Depth-First Search (DFS) to detect cycles.
 *
 * @param dep - The dependency to check.
 * @param current - The node currently being evaluated (the potential closer of the loop).
 * @param visited - Set of IDs already visited in this traversal path.
 */
function checkCircularInternal(dep: Dependency, current: object, visited: Set<number>): void {
  // Cycle detected in *this* path
  if (dep === current) {
    throw new ComputedError(
      'Circular dependency detected: The computation refers to itself explicitly or implicitly.'
    );
  }

  // Already visited this node in the current traversal? Skip to avoid redundant work/infinite recursion
  if (visited.has(dep.id)) return;
  visited.add(dep.id);

  if (hasDeps(dep)) {
    const deps = dep.dependencies;
    // Standard for loop is faster than for...of or forEach
    for (let i = 0; i < deps.length; i++) {
      const child = deps[i];
      if (child) {
        checkCircularInternal(child, current, visited);
      }
    }
  }
}

/**
 * Global debug controller.
 * Designed to compile away to almost nothing in production.
 */
export const debug: DebugConfig = {
  // In production, build tools will replace IS_DEV with `false`, making this property a constant false.
  enabled: IS_DEV,

  maxDependencies: DEBUG_CONFIG.MAX_DEPENDENCIES,
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

    if (IS_DEV && this.enabled) {
      checkCircularInternal(dep, current, new Set());
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
 * Monotonically increasing ID counter.
 * Starts at 1 because 0 is often falsy or reserved.
 */
let nextId = 1;

/**
 * Generates a unique dependency ID.
 * This is a critical hot path, so it's kept extremely simple.
 */
export const generateId = () => nextId++ as DependencyId;
