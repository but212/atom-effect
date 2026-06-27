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
import type { DebugConfig, DependencyId, IdentifiableNode, NodeMetadata } from '@/types';

/** Shared no-op function to reduce memory pressure in production. @internal */
const noopCallback = () => {};

/** Helper to resolve fallback node identity structurally. @internal */
const getFallbackIdentity = (targetObject: object, id: DependencyId): NodeMetadata => {
  const brand = (targetObject as { [BRAND]?: number })[BRAND];
  const brandMetadata = brand === undefined ? undefined : BRAND_IDENTITY_MAP[brand & BRAND_MASK];
  const type = brandMetadata?.type ?? 'unknown';
  const prefix = brandMetadata?.prefix ?? `${type}_`;
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
  #isCleanupScheduled = false;
  #isFailureCleanupScheduled = false;

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

  isEnabled = true;
  shouldWarnInfiniteLoop = DEBUG_CONFIG.WARN_INFINITE_LOOP;
  shouldTrackGraph = false;

  /**
   * Logic: Structural Identity Resolution
   * Discovers the name and type of a node by inspecting its internal ID and
   * BRAND discriminator. Falls back to structural probing if the node is not
   * yet registered.
   */
  #resolveIdentity(targetObject: object): { name: string; type: string } | undefined {
    if (targetObject === null || typeof targetObject !== 'object') {
      return undefined;
    }

    const id = (targetObject as { id?: DependencyId }).id;
    if (id === undefined) {
      return undefined;
    }

    return this.#registry.get(id) ?? getFallbackIdentity(targetObject, id);
  }

  #getOrCreateMetadata(targetObject: object, id: DependencyId): NodeMetadata {
    let nodeMetadata = this.#registry.get(id);
    if (!nodeMetadata) {
      nodeMetadata = getFallbackIdentity(targetObject, id);
      this.#registry.set(id, nodeMetadata);
    }
    return nodeMetadata;
  }

  #resetUpdateCounts = (): void => {
    this.#updateCounts.clear();
    this.#isCleanupScheduled = false;
  };

  #resetFailedEvaluations = (): void => {
    this.#failedEvaluations.clear();
    this.#isFailureCleanupScheduled = false;
  };

  isWarningCondition(isWarningCondition: boolean, warningMessage: string): void {
    if (this.isEnabled && isWarningCondition) {
      console.warn(`${DEBUG_PREFIX} ${warningMessage}`);
    }
  }

  registerNode(node: IdentifiableNode): void {
    if (!this.isEnabled || node === null || typeof node !== 'object' || node.id === undefined) {
      return;
    }
    const id = node.id;
    const entry = this.#getOrCreateMetadata(node, id);

    entry.ref = new WeakRef(node);
    this.#finalizer.register(node, id);
  }

  attachDebugInfo(
    targetObject: IdentifiableNode,
    type: string,
    id: DependencyId,
    customName?: string
  ): void {
    if (!this.isEnabled) return;
    const hasEntry = this.#registry.has(id);
    if (!hasEntry && customName === undefined && !this.shouldTrackGraph) return;
    if (targetObject === null || typeof targetObject !== 'object' || id === undefined) return;

    let nodeMetadata = this.#registry.get(id);
    if (nodeMetadata) {
      if (customName !== undefined) {
        nodeMetadata.name = customName;
        nodeMetadata.custom = true;
      } else if (!nodeMetadata.custom) {
        nodeMetadata.name = `${type}_${id}`;
      }
      nodeMetadata.type = type;
    } else {
      nodeMetadata = {
        name: customName ?? `${type}_${id}`,
        type,
        custom: customName !== undefined,
      };
      this.#registry.set(id, nodeMetadata);
    }

    this.registerNode(targetObject);
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
    if (!this.isEnabled || !this.shouldWarnInfiniteLoop) return;

    const updateCount = (this.#updateCounts.get(id) || 0) + 1;
    this.#updateCounts.set(id, updateCount);

    const threshold = DEBUG_CONFIG.LOOP_THRESHOLD;
    if (updateCount > threshold) {
      if (updateCount === threshold + 1) {
        console.warn(
          `${DEBUG_PREFIX} Infinite loop detected for ${name ?? `dependency ${id}`}. ` +
            `Detected ${updateCount} updates within a single execution scope, exceeding the threshold of ${threshold}.`
        );
      }
    }

    if (!this.#isCleanupScheduled) {
      this.#isCleanupScheduled = true;
      queueMicrotask(this.#resetUpdateCounts);
    }
  }

  trackEvaluationFailure(id: DependencyId): void {
    if (!this.isEnabled || this.#failedEvaluations.has(id)) return;

    this.#failedEvaluations.add(id);
    console.warn(`${DEBUG_PREFIX} Dependency #${id} evaluation failed during dirty check.`);

    if (!this.#isFailureCleanupScheduled) {
      this.#isFailureCleanupScheduled = true;
      queueMicrotask(this.#resetFailedEvaluations);
    }
  }

  getDebugName(targetObject: object | null | undefined): string | undefined {
    if (!this.isEnabled || !targetObject) return undefined;
    return this.#resolveIdentity(targetObject)?.name;
  }

  getDebugType(targetObject: object | null | undefined): string | undefined {
    if (!this.isEnabled || !targetObject) return undefined;
    return this.#resolveIdentity(targetObject)?.type;
  }

  dumpGraph(): Record<string, unknown>[] {
    if (!this.isEnabled || this.#registry.size === 0) return [];

    const graphMetadataList: Record<string, unknown>[] = [];
    for (const [id, meta] of this.#registry) {
      if (meta.ref?.deref() === undefined) {
        this.#pruneNode(id);
        continue;
      }
      graphMetadataList.push({
        id,
        name: meta.name,
        type: meta.type,
        updateCount: this.#updateCounts.get(id) ?? 0,
      });
    }
    return graphMetadataList;
  }
}

/**
 * Role: Production No-op Stub
 * Provides a compliant but zero-overhead implementation for production bundles.
 * All methods are optimized away as no-ops.
 * @internal
 */
const ProdDebugController: DebugConfig = {
  isEnabled: false,
  shouldWarnInfiniteLoop: false,
  shouldTrackGraph: false,
  isWarningCondition: noopCallback,
  registerNode: noopCallback,
  attachDebugInfo: noopCallback,
  trackUpdate: noopCallback,
  dumpGraph: () => [],
  getDebugName: () => undefined,
  getDebugType: () => undefined,
  trackEvaluationFailure: noopCallback,
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
export const isWarningCondition = (condition: boolean, message: string) =>
  debug.isWarningCondition(condition, message);
export const registerNode = (node: IdentifiableNode) => debug.registerNode(node);
export const attachDebugInfo = (
  targetObject: IdentifiableNode,
  type: string,
  id: DependencyId,
  customName?: string
) => debug.attachDebugInfo(targetObject, type, id, customName);
export const trackUpdate = (id: DependencyId, name?: string) => debug.trackUpdate(id, name);
export const trackEvaluationFailure = (id: DependencyId) => debug.trackEvaluationFailure(id);
export const getDebugName = (targetObject: object | null | undefined) =>
  debug.getDebugName(targetObject);
export const getDebugType = (targetObject: object | null | undefined) =>
  debug.getDebugType(targetObject);
export const dumpGraph = () => debug.dumpGraph();

/** @internal */
let nextNodeId = 1;

/**
 * Logic: Unique Node Identity
 * Generates an internal unique ID for each reactive node.
 * IDs are used for dependency tracking, graph visualization, and debugging.
 *
 * @returns A unique `DependencyId`.
 */
export const generateId = (): DependencyId => nextNodeId++;
