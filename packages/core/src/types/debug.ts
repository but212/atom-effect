/**
 * @module Debug_Types
 *
 * Responsibility:
 * Defines interfaces and sentinels for engine diagnostics and visualization.
 */

import type { DependencyId } from './base';

/**
 * Why: A unique identity is required to distinguish between an intentional
 * 'undefined' value and a property that has not been initialized.
 */
export const NO_DEFAULT_VALUE = Symbol('AtomEffect.NoDefaultValue');

/**
 * Role: Internal metadata container for reactive nodes.
 * @internal
 */
export interface NodeMetadata {
  name: string;
  type: string;
  ref?: WeakRef<object>;
}

/**
 * Internal interface for engine instrumentation and diagnostic hooks.
 * @internal
 */
export interface DebugConfig {
  enabled: boolean;
  warnInfiniteLoop: boolean;
  trackGraph: boolean;
  warn(condition: boolean, message: string): void;
  attachDebugInfo(obj: object, type: string, id: number, customName?: string): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
  trackUpdate(id: DependencyId, name?: string): void;
  registerNode(node: object & { id: DependencyId }): void;
  trackEvaluationFailure(id: DependencyId): void;
  /** Returns a serializable representation of the current reactive dependency graph. */
  dumpGraph(): Record<string, unknown>[];
}
