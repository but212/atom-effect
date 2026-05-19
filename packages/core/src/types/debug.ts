/**
 * @module DebugTypes
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
 *
 * @internal
 */
export interface DebugConfig {
  /** Global toggle for all diagnostic logic. Set to false in production. */
  enabled: boolean;

  /** If true, warns when a node updates too many times in one cycle. */
  warnInfiniteLoop: boolean;

  /**
   * If true, keeps WeakRefs to all registered nodes to allow graph visualization.
   * Increasing this will slightly increase memory overhead.
   */
  trackGraph: boolean;

  /** Standardized warning logger for the library. */
  warn(condition: boolean, message: string): void;

  /** Registers a node and attaches human-readable metadata. */
  attachDebugInfo(obj: object, type: string, id: DependencyId, customName?: string): void;

  /** Retrieves the human-readable name of a reactive node. */
  getDebugName(obj: object | null | undefined): string | undefined;

  /** Retrieves the diagnostic type (e.g., 'atom', 'computed') of a node. */
  getDebugType(obj: object | null | undefined): string | undefined;

  /** Monitors update frequency to detect and warn about infinite loops. */
  trackUpdate(id: DependencyId, name?: string): void;

  /** Registers a node for lifecycle tracking and automatic metadata cleanup. */
  registerNode(node: object & { id: DependencyId }): void;

  /** Records evaluation failures for deduplicated warning emission. */
  trackEvaluationFailure(id: DependencyId): void;

  /**
   * Captures a snapshot of all active reactive nodes and their diagnostic state.
   * Returns an array of diagnostic records for active nodes.
   */
  dumpGraph(): Record<string, unknown>[];
}
