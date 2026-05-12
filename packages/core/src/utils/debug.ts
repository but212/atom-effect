/**
 * @module Debug
 *
 * Responsibility:
 * Provides diagnostic utilities for development, including graph visualization,
 * infinite loop detection, and node identification.
 *
 * Design Intent:
 * Decouples diagnostic state from reactive nodes to prevent de-optimization
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

// --- Private Development State ---
/** @internal */
const devState = IS_DEV
  ? {
      updateCounts: new Map<DependencyId, number>(),
      registry: new Map<DependencyId, NodeMetadata>(),
      failedEvaluations: new Set<DependencyId>(),
      cleanupScheduled: false,
      failureCleanupScheduled: false,
      finalizer: new FinalizationRegistry((id: DependencyId) => {
        devState!.registry.delete(id);
        devState!.updateCounts.delete(id);
      }),
    }
  : null;

// --- Helper Functions ---

const _resolveIdentity = (obj: object): { name: string; type: string } | undefined => {
  const id = (obj as { id?: DependencyId }).id;
  if (id === undefined) return undefined;

  const meta = devState!.registry.get(id);
  if (meta) return meta;

  const brand = (obj as { [BRAND]?: number })[BRAND];
  const info = brand !== undefined ? BRAND_IDENTITY_MAP[brand & BRAND_MASK] : undefined;

  const type = info?.type ?? 'unknown';
  const prefix = info?.prefix ?? `${type}_`;

  return { name: `${prefix}${id}`, type };
};

const _getOrCreateMetadata = (obj: object, id: DependencyId): NodeMetadata => {
  let entry = devState!.registry.get(id);
  if (!entry) {
    const identity = _resolveIdentity(obj)!;
    entry = { name: identity.name, type: identity.type };
    devState!.registry.set(id, entry);
  }
  return entry;
};

const _resetUpdateCounts = (): void => {
  devState!.updateCounts.clear();
  devState!.cleanupScheduled = false;
};

const _resetFailedEvaluations = (): void => {
  devState!.failedEvaluations.clear();
  devState!.failureCleanupScheduled = false;
};

// --- Core Diagnostic Functions ---

/** Standardized warning logger for the library. */
export const warn = (cond: boolean, msg: string): void => {
  if (IS_DEV && debug.enabled && cond) {
    console.warn(`${DEBUG_PREFIX} ${msg}`);
  }
};

/** Registers a node for lifecycle tracking and automatic cleanup. */
export const registerNode = (node: object & { id: DependencyId }): void => {
  if (!IS_DEV) return;
  const id = node.id;
  const entry = _getOrCreateMetadata(node, id);

  entry.ref = new WeakRef(node);
  devState!.finalizer.register(node, id);
};

/** Attaches human-readable labels and type information to a node. */
export const attachDebugInfo = (
  obj: object,
  type: string,
  id: DependencyId,
  customName?: string
): void => {
  if (!IS_DEV || !debug.enabled || (customName === undefined && !debug.trackGraph)) return;

  let entry = devState!.registry.get(id);
  if (!entry) {
    entry = { name: customName ?? `${type}_${id}`, type };
    devState!.registry.set(id, entry);
  } else {
    if (customName !== undefined) entry.name = customName;
    entry.type = type;
  }

  debug.registerNode(obj as object & { id: DependencyId });
};

/** Monitors update frequency to detect and warn about infinite loops. */
export const trackUpdate = (id: DependencyId, name?: string): void => {
  if (!IS_DEV || !debug.enabled || !debug.warnInfiniteLoop) return;

  const count = (devState!.updateCounts.get(id) || 0) + 1;
  devState!.updateCounts.set(id, count);

  const threshold = DEBUG_CONFIG.LOOP_THRESHOLD;
  if (count > threshold) {
    if (count === threshold + 1) {
      console.warn(
        `${DEBUG_PREFIX} Infinite loop detected for ${name ?? `dependency ${id}`}. ` +
          `Detected ${count} updates within a single execution scope, exceeding the threshold of ${threshold}.`
      );
    }
  }

  if (!devState!.cleanupScheduled) {
    devState!.cleanupScheduled = true;
    queueMicrotask(_resetUpdateCounts);
  }
};

/** Records evaluation failures during dirty checks. */
export const trackEvaluationFailure = (id: DependencyId): void => {
  if (!IS_DEV || !debug.enabled || devState!.failedEvaluations.has(id)) return;

  devState!.failedEvaluations.add(id);
  console.warn(`${DEBUG_PREFIX} Dependency #${id} evaluation failed during dirty check.`);

  if (!devState!.failureCleanupScheduled) {
    devState!.failureCleanupScheduled = true;
    queueMicrotask(_resetFailedEvaluations);
  }
};

/** Retrieves the human-readable name of a reactive node. */
export const getDebugName = (obj: object | null | undefined): string | undefined => {
  if (!IS_DEV || !debug.enabled || !obj) return undefined;
  return _resolveIdentity(obj)?.name;
};

/** Retrieves the diagnostic type of a reactive node. */
export const getDebugType = (obj: object | null | undefined): string | undefined => {
  if (!IS_DEV || !debug.enabled || !obj) return undefined;
  return _resolveIdentity(obj)?.type;
};

/** Captures a snapshot of all active reactive nodes and their diagnostic state. */
export const dumpGraph = (): Record<string, unknown>[] => {
  if (!IS_DEV) return [];
  if (devState!.registry.size === 0) return [];

  const result: Record<string, unknown>[] = [];
  for (const [id, meta] of devState!.registry) {
    if (debug.trackGraph && meta.ref?.deref() === undefined) {
      continue;
    }
    result.push({
      id,
      name: meta.name,
      type: meta.type,
      updateCount: devState!.updateCounts.get(id) ?? 0,
    });
  }
  return result;
};

// --- Production Controller (Static No-ops) ---

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

// --- Global Export ---

/**
 * Global diagnostic hub for the atom-effect library.
 * Refactored as an object literal for optimal V8 performance.
 */
export const debug: DebugConfig = IS_DEV
  ? {
      enabled: true,
      warnInfiniteLoop: DEBUG_CONFIG.WARN_INFINITE_LOOP,
      trackGraph: false,
      warn,
      registerNode,
      attachDebugInfo,
      trackUpdate,
      dumpGraph,
      getDebugName,
      getDebugType,
      trackEvaluationFailure,
    }
  : ProdDebugController;

/** @internal */
let nextId = 1;

/**
 * Generates an internal unique ID for a reactive node.
 */
export const generateId = (): DependencyId => nextId++ as DependencyId;
