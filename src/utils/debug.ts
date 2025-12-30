/**
 * @fileoverview Debug configuration and utilities
 * @description Development-time debugging tools for dependency tracking and circular reference detection
 */

import { DEBUG_CONFIG } from '../constants';
import { ComputedError } from '../errors/errors';
import type { DebugConfig } from '../types';

/**
 * Symbols for debug metadata to avoid property name collisions
 */
export const DEBUG_NAME = Symbol('debugName');
export const DEBUG_ID = Symbol('id');
export const DEBUG_TYPE = Symbol('type');

/**
 * Sentinel value to distinguish "no default value" from undefined
 */
export const NO_DEFAULT_VALUE = Symbol('noDefaultValue');

export const debug: DebugConfig = {
  enabled:
    typeof process !== 'undefined' && (process as NodeJS.Process).env?.NODE_ENV === 'development',
  maxDependencies: DEBUG_CONFIG.MAX_DEPENDENCIES,
  warnInfiniteLoop: DEBUG_CONFIG.WARN_INFINITE_LOOP,

  warn(condition: boolean, message: string): void {
    if (this.enabled && condition) {
      console.warn(`[Reactive Atom] ${message}`);
    }
  },

  checkCircular(dep: unknown, current: unknown, visited = new Set<unknown>()): void {
    // Direct circular reference check (A→A) - Always checked even in production
    if (dep === current) {
      throw new ComputedError('Direct circular dependency detected');
    }

    // Indirect circular reference check only in development mode (for performance)
    if (!this.enabled) return;

    // Indirect circular reference check (A→B→C→A)
    if (visited.has(dep)) {
      throw new ComputedError('Indirect circular dependency detected');
    }

    visited.add(dep);

    // Recursively check nested dependencies
    if (dep && typeof dep === 'object' && 'dependencies' in dep) {
      const dependencies = (dep as { dependencies: Set<unknown> }).dependencies;
      for (const nestedDep of dependencies) {
        this.checkCircular(nestedDep, current, visited);
      }
    }
  },

  attachDebugInfo(obj: object, type: string, id: number): void {
    if (!this.enabled) return;
    const target = obj as Record<symbol, unknown>;
    target[DEBUG_NAME] = `${type}_${id}`;
    target[DEBUG_ID] = id;
    target[DEBUG_TYPE] = type;
  },

  getDebugName(obj: unknown): string | undefined {
    if (obj && typeof obj === 'object' && DEBUG_NAME in obj) {
      return (obj as Record<symbol, unknown>)[DEBUG_NAME] as string | undefined;
    }
    return undefined;
  },

  getDebugType(obj: unknown): string | undefined {
    if (obj && typeof obj === 'object' && DEBUG_TYPE in obj) {
      return (obj as Record<symbol, unknown>)[DEBUG_TYPE] as string | undefined;
    }
    return undefined;
  },
};

let nextId = 1;
export const generateId = (): number => nextId++;
