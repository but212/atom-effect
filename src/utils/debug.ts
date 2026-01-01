/**
 * @fileoverview Debug configuration and utilities
 *
 * This module provides development-time debugging tools for dependency tracking
 * and circular reference detection in the reactive state management system.
 *
 * @module utils/debug
 * @see {@link DebugConfig} for the configuration interface
 */

import { DEBUG_CONFIG } from '../constants';
import { ComputedError } from '../errors/errors';
import type { DebugConfig } from '../types';

/**
 * Symbol key for storing debug display name on reactive objects.
 *
 * @remarks
 * Using symbols prevents property name collisions with user-defined properties.
 *
 * @example
 * ```typescript
 * const atom = createAtom(0);
 * console.log(atom[DEBUG_NAME]); // "atom_1"
 * ```
 */
export const DEBUG_NAME: unique symbol = Symbol('debugName');

/**
 * Symbol key for storing unique identifier on reactive objects.
 *
 * @remarks
 * Each reactive object (atom, computed, effect) receives a unique numeric ID
 * for debugging and tracking purposes.
 */
export const DEBUG_ID: unique symbol = Symbol('id');

/**
 * Symbol key for storing the type discriminator on reactive objects.
 *
 * @remarks
 * Possible values: 'atom' | 'computed' | 'effect'
 */
export const DEBUG_TYPE: unique symbol = Symbol('type');

/**
 * Sentinel value to distinguish "no default value provided" from `undefined`.
 *
 * @remarks
 * This allows computed values to differentiate between:
 * - User explicitly passing `undefined` as default
 * - User not providing any default value
 *
 * @example
 * ```typescript
 * const hasDefault = options.defaultValue !== NO_DEFAULT_VALUE;
 * ```
 */
export const NO_DEFAULT_VALUE: unique symbol = Symbol('noDefaultValue');

/**
 * Type guard for objects with a dependencies property.
 *
 * @param obj - The object to check
 * @returns True if the object has a Set-typed dependencies property
 *
 * @internal
 */
function hasDependencies(obj: unknown): obj is { dependencies: Set<unknown> } {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'dependencies' in obj &&
    (obj as { dependencies: unknown }).dependencies instanceof Set
  );
}

/**
 * Debug configuration instance with runtime utilities.
 *
 * Provides development-time features including:
 * - Circular dependency detection (direct and indirect)
 * - Large dependency graph warnings
 * - Debug metadata attachment for inspection
 *
 * @remarks
 * Most features are only active when `NODE_ENV === 'development'`
 * to avoid performance overhead in production builds.
 *
 * @example
 * ```typescript
 * // Check for circular dependencies
 * debug.checkCircular(dependencyAtom, computedAtom);
 *
 * // Warn about potential issues
 * debug.warn(count > 100, 'Large dependency count detected');
 *
 * // Attach debug info to a reactive object
 * debug.attachDebugInfo(atom, 'atom', 42);
 * ```
 */
export const debug: DebugConfig = {
  /**
   * Whether debug mode is enabled.
   *
   * @remarks
   * Automatically set based on `NODE_ENV` environment variable.
   * Only `'development'` enables debug features.
   */
  enabled:
    typeof process !== 'undefined' && (process as NodeJS.Process).env?.NODE_ENV === 'development',

  /**
   * Maximum number of dependencies before warning.
   *
   * @see {@link DEBUG_CONFIG.MAX_DEPENDENCIES}
   */
  maxDependencies: DEBUG_CONFIG.MAX_DEPENDENCIES,

  /**
   * Whether to warn about potential infinite loops.
   *
   * @see {@link DEBUG_CONFIG.WARN_INFINITE_LOOP}
   */
  warnInfiniteLoop: DEBUG_CONFIG.WARN_INFINITE_LOOP,

  /**
   * Logs a warning message when condition is true and debug is enabled.
   *
   * @param condition - When true, the warning is logged
   * @param message - The warning message to display
   *
   * @example
   * ```typescript
   * debug.warn(deps.length > 100, 'Large dependency graph detected');
   * ```
   */
  warn(condition: boolean, message: string): void {
    if (this.enabled && condition) {
      console.warn(`[Atom Effect] ${message}`);
    }
  },

  /**
   * Checks for circular dependencies in the dependency graph.
   *
   * Detects two types of circular references:
   * 1. **Direct**: A depends on itself (A → A)
   * 2. **Indirect**: A depends on B which depends on A (A → B → A)
   *
   * @param dep - The dependency being added
   * @param current - The current reactive object adding the dependency
   * @param visited - Set of already visited nodes (for recursion)
   *
   * @throws {ComputedError} When a circular dependency is detected
   *
   * @remarks
   * - Direct circular detection runs in all environments
   * - Indirect circular detection only runs in development mode
   * - Uses depth-first traversal with O(n) time complexity
   *
   * @example
   * ```typescript
   * // This will throw for direct circular reference
   * debug.checkCircular(computedA, computedA);
   *
   * // This will throw for indirect circular reference (dev only)
   * // Given: A → B → C → A
   * debug.checkCircular(computedC, computedA);
   * ```
   */
  checkCircular(dep: unknown, current: unknown, visited = new Set<unknown>()): void {
    // Direct circular reference check (A→A) - Always checked even in production
    if (dep === current) {
      throw new ComputedError('Direct circular dependency detected');
    }

    // Indirect circular reference check only in development mode (for performance)
    if (!this.enabled) {
      return;
    }

    // Indirect circular reference check (A→B→C→A)
    if (visited.has(dep)) {
      throw new ComputedError('Indirect circular dependency detected');
    }

    visited.add(dep);

    // Recursively check nested dependencies using type guard
    if (hasDependencies(dep)) {
      for (const nestedDep of dep.dependencies) {
        this.checkCircular(nestedDep, current, visited);
      }
    }
  },

  /**
   * Attaches debug metadata to a reactive object.
   *
   * @param obj - The object to attach metadata to
   * @param type - The type of reactive object ('atom' | 'computed' | 'effect')
   * @param id - The unique identifier for this object
   *
   * @remarks
   * Only attaches metadata when debug mode is enabled.
   * Uses symbol keys to avoid property name collisions.
   *
   * @example
   * ```typescript
   * const atom = createAtomInternal(0);
   * debug.attachDebugInfo(atom, 'atom', 1);
   * // atom[DEBUG_NAME] === 'atom_1'
   * // atom[DEBUG_ID] === 1
   * // atom[DEBUG_TYPE] === 'atom'
   * ```
   */
  attachDebugInfo(obj: object, type: string, id: number): void {
    if (!this.enabled) {
      return;
    }

    const target = obj as Record<symbol, unknown>;
    target[DEBUG_NAME] = `${type}_${id}`;
    target[DEBUG_ID] = id;
    target[DEBUG_TYPE] = type;
  },

  /**
   * Retrieves the debug display name from a reactive object.
   *
   * @param obj - The object to get the name from
   * @returns The debug name (e.g., 'atom_1') or undefined if not set
   *
   * @example
   * ```typescript
   * const name = debug.getDebugName(myAtom);
   * console.log(`Updating ${name ?? 'unknown'}`);
   * ```
   */
  getDebugName(obj: unknown): string | undefined {
    if (obj !== null && typeof obj === 'object' && DEBUG_NAME in obj) {
      return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
    }
    return undefined;
  },

  /**
   * Retrieves the debug type from a reactive object.
   *
   * @param obj - The object to get the type from
   * @returns The type ('atom' | 'computed' | 'effect') or undefined if not set
   *
   * @example
   * ```typescript
   * const type = debug.getDebugType(reactiveObj);
   * if (type === 'computed') {
   *   // Handle computed-specific logic
   * }
   * ```
   */
  getDebugType(obj: unknown): string | undefined {
    if (obj !== null && typeof obj === 'object' && DEBUG_TYPE in obj) {
      return (obj as Record<symbol, unknown>)[DEBUG_TYPE] as string | undefined;
    }
    return undefined;
  },
};

/**
 * Counter for generating unique IDs.
 *
 * @internal
 */
let nextId = 1;

/**
 * Generates a unique numeric identifier for reactive objects.
 *
 * @returns A unique positive integer, incrementing with each call
 *
 * @remarks
 * IDs are globally unique within a single runtime session.
 * The counter resets when the module is reloaded.
 *
 * @example
 * ```typescript
 * const atomId = generateId(); // 1
 * const computedId = generateId(); // 2
 * ```
 */
export const generateId = (): number => nextId++;
