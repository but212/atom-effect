/**
 * @module DebugDiagnostics
 *
 * Responsibility:
 * Provides diagnostic utilities for development, including graph visualization,
 * infinite loop detection, and node identification.
 *
 * Design Intent:
 * Decouples diagnostic state from reactive nodes to prevent de-optimization of
 * the reactive hot-path.
 *
 * Memory Strategy:
 * Uses `FinalizationRegistry` and `WeakRef` to ensure that debug metadata does
 * not prevent the garbage collection of reactive nodes.
 */

import {
  BRAND,
  BRAND_IDENTITY_MAP,
  BRAND_MASK,
  DEBUG_CONFIG,
  DEBUG_PREFIX,
  IS_DEV,
} from '@/constants';
import type { DebugConfig, DependencyId, NodeMetadata } from '@/types';

/** Shared no-op function to reduce memory pressure in production. @internal */
const noop = () => {};

/** Helper to resolve fallback node identity structurally. @internal */
const getFallbackIdentity = (obj: object, id: DependencyId): NodeMetadata => {
  const brand = (obj as { [BRAND]?: number })[BRAND];
  const info = brand === undefined ? undefined : BRAND_IDENTITY_MAP[brand & BRAND_MASK];
  const type = info?.type ?? 'unknown';
  const prefix = info?.prefix ?? `${type}_`;
  return { name: `${prefix}${id}`, type };
};

/**
 * Role: Diagnostic Engine (Development)
 * Encapsulates development-only diagnostic state and provides high-performance
 * tracking using ES2022 private class fields.
 * @internal
 */
class DevDebugEngine implements DebugConfig {
  #updateCounts = new Map<DependencyId, number>();
  #registry = new Map<DependencyId, NodeMetadata>();
  #failedEvaluations = new Set<DependencyId>();
  #cleanupScheduled = false;
  #failureCleanupScheduled = false;

  #pruneNode(id: DependencyId): void {
    this.#registry.delete(id);
    this.#updateCounts.delete(id);
  }

  /**
   * Logic: Automatic Metadata Cleanup
   * Monitors node lifecycle to prune internal registries when reactive nodes
   * are garbage collected, preventing memory leaks in long-running dev sessions.
   */
  #finalizer = new FinalizationRegistry((id: DependencyId) => this.#pruneNode(id));

  enabled = true;
  warnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;
  trackGraph = false;

  /**
   * Logic: Structural Identity Resolution
   * Discovers the name and type of a node by inspecting its internal ID and
   * BRAND discriminator. Falls back to structural probing if the node is not
   * yet registered.
   */
  #resolveIdentity(obj: object): { name: string; type: string } | undefined {
    if (obj === null || typeof obj !== 'object') {
      return undefined;
    }

    const id = (obj as { id?: DependencyId }).id;
    if (id === undefined) {
      return undefined;
    }

    return this.#registry.get(id) ?? getFallbackIdentity(obj, id);
  }

  #getOrCreateMetadata(obj: object, id: DependencyId): NodeMetadata {
    let entry = this.#registry.get(id);
    if (!entry) {
      entry = getFallbackIdentity(obj, id);
      this.#registry.set(id, entry);
    }
    return entry;
  }

  #resetUpdateCounts = (): void => {
    this.#updateCounts.clear();
    this.#cleanupScheduled = false;
  };

  #resetFailedEvaluations = (): void => {
    this.#failedEvaluations.clear();
    this.#failureCleanupScheduled = false;
  };

  warn(cond: boolean, msg: string): void {
    if (this.enabled && cond) {
      console.warn(`${DEBUG_PREFIX} ${msg}`);
    }
  }

  registerNode(node: object & { id: DependencyId }): void {
    if (!this.enabled || node === null || typeof node !== 'object' || node.id === undefined) {
      return;
    }
    const id = node.id;
    const entry = this.#getOrCreateMetadata(node, id);

    entry.ref = new WeakRef(node);
    this.#finalizer.register(node, id);
  }

  attachDebugInfo(obj: object, type: string, id: DependencyId, customName?: string): void {
    if (!this.enabled) return;
    const hasEntry = this.#registry.has(id);
    if (!hasEntry && customName === undefined && !this.trackGraph) return;
    if (obj === null || typeof obj !== 'object' || id === undefined) return;

    let entry = this.#registry.get(id);
    if (entry) {
      if (customName !== undefined) {
        entry.name = customName;
        entry.custom = true;
      } else if (!entry.custom) {
        entry.name = `${type}_${id}`;
      }
      entry.type = type;
    } else {
      entry = { name: customName ?? `${type}_${id}`, type, custom: customName !== undefined };
      this.#registry.set(id, entry);
    }

    this.registerNode(obj as object & { id: DependencyId });
  }

  /**
   * Logic: Infinite Loop Detection
   * Tracks update frequency per-node within a single microtask scope.
   * If updates exceed the threshold, a warning is emitted.
   *
   * Why: Microtask Scoping
   * Resets counts using `queueMicrotask` to isolate the detection logic to a
   * single reactive flush cycle, avoiding false positives across user interactions.
   */
  trackUpdate(id: DependencyId, name?: string): void {
    if (!this.enabled || !this.warnInfiniteLoop) return;

    const count = (this.#updateCounts.get(id) || 0) + 1;
    this.#updateCounts.set(id, count);

    const threshold = DEBUG_CONFIG.LOOP_THRESHOLD;
    if (count > threshold) {
      if (count === threshold + 1) {
        console.warn(
          `${DEBUG_PREFIX} Infinite loop detected for ${name ?? `dependency ${id}`}. ` +
            `Detected ${count} updates within a single execution scope, exceeding the threshold of ${threshold}.`
        );
      }
    }

    if (!this.#cleanupScheduled) {
      this.#cleanupScheduled = true;
      queueMicrotask(this.#resetUpdateCounts);
    }
  }

  trackEvaluationFailure(id: DependencyId): void {
    if (!this.enabled || this.#failedEvaluations.has(id)) return;

    this.#failedEvaluations.add(id);
    console.warn(`${DEBUG_PREFIX} Dependency #${id} evaluation failed during dirty check.`);

    if (!this.#failureCleanupScheduled) {
      this.#failureCleanupScheduled = true;
      queueMicrotask(this.#resetFailedEvaluations);
    }
  }

  getDebugName(obj: object | null | undefined): string | undefined {
    if (!this.enabled || !obj) return undefined;
    return this.#resolveIdentity(obj)?.name;
  }

  getDebugType(obj: object | null | undefined): string | undefined {
    if (!this.enabled || !obj) return undefined;
    return this.#resolveIdentity(obj)?.type;
  }

  dumpGraph(): Record<string, unknown>[] {
    if (!this.enabled || this.#registry.size === 0) return [];

    const result: Record<string, unknown>[] = [];
    for (const [id, meta] of this.#registry) {
      if (meta.ref?.deref() === undefined) {
        this.#pruneNode(id);
        continue;
      }
      result.push({
        id,
        name: meta.name,
        type: meta.type,
        updateCount: this.#updateCounts.get(id) ?? 0,
      });
    }
    return result;
  }
}

/**
 * Role: Production No-op Stub
 * Provides a compliant but zero-overhead implementation for production bundles.
 * All methods are optimized away as no-ops.
 * @internal
 */
const ProdDebugController: DebugConfig = {
  enabled: false,
  warnInfiniteLoop: false,
  trackGraph: false,
  warn: noop,
  registerNode: noop,
  attachDebugInfo: noop,
  trackUpdate: noop,
  dumpGraph: () => [],
  getDebugName: () => undefined,
  getDebugType: () => undefined,
  trackEvaluationFailure: noop,
};

/**
 * Role: Global Diagnostic Hub
 * The primary entry point for all diagnostic and debugging operations.
 * Resolves to a no-op controller in production to ensure zero performance impact.
 */
export const debug: DebugConfig = IS_DEV ? new DevDebugEngine() : ProdDebugController;

/**
 * Individual exports for direct usage (proxied to the debug singleton).
 */
export const warn = (cond: boolean, msg: string) => debug.warn(cond, msg);
export const registerNode = (node: object & { id: DependencyId }) => debug.registerNode(node);
export const attachDebugInfo = (obj: object, type: string, id: DependencyId, customName?: string) =>
  debug.attachDebugInfo(obj, type, id, customName);
export const trackUpdate = (id: DependencyId, name?: string) => debug.trackUpdate(id, name);
export const trackEvaluationFailure = (id: DependencyId) => debug.trackEvaluationFailure(id);
export const getDebugName = (obj: object | null | undefined) => debug.getDebugName(obj);
export const getDebugType = (obj: object | null | undefined) => debug.getDebugType(obj);
export const dumpGraph = () => debug.dumpGraph();

/** @internal */
let nextId = 1;

/**
 * Logic: Unique Node Identity
 * Generates an internal unique ID for each reactive node.
 * IDs are used for dependency tracking, graph visualization, and debugging.
 *
 * @returns A unique `DependencyId`.
 */
export const generateId = (): DependencyId => nextId++ as DependencyId;
