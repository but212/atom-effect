/**
 * @module EnvironmentConfiguration
 *
 * Responsibility:
 * This module handles environment detection (Node.js, Vite, ESM) and defines
 * performance-tuning constants used for heuristics and loop protection.
 */

/**
 * V8 SMI (Small Integer) Limit.
 *
 * Why: V8 stores 31-bit signed integers (on 64-bit systems) directly in CPU
 * registers. Values within this range avoid heap allocation and boxing,
 * making them ideal for high-frequency epoch counters and indices.
 *
 * @internal
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Development-time diagnostic thresholds.
 *
 * Why: These limits prevent memory-exhausting infinite loops during development
 * without imposing overhead in production.
 *
 * @internal
 */
export const DEBUG_CONFIG = Object.freeze({
  /** Enables console warnings for potential infinite recursion or update loops. */
  WARN_INFINITE_LOOP: true,
  /** Sliding window size (ms) for calculating update frequency. */
  EFFECT_FREQUENCY_WINDOW: 1000,
  /** Max updates per window allowed before flagging a potential loop. */
  LOOP_THRESHOLD: 100,
} satisfies Record<string, boolean | number>);

/**
 * Internal heuristics for dependency management.
 *
 * Why: For small sets of dependencies, a linear search on a flat array is
 * faster than a Map lookup due to CPU cache locality and lower initialization cost.
 *
 * @internal
 */
export const BUFFER_CONFIG = Object.freeze({
  /** The item count threshold where we pivot from linear search to Map lookup. */
  MAP_THRESHOLD: 8,
} satisfies Record<string, number>);

/**
 * Lenses and path resolution constraints.
 *
 * Why: Prevents infinite recursion and stack overflow in cases of circular
 * object references or extremely deep state trees.
 *
 * @internal
 */
export const LENS_CONFIG = Object.freeze({
  /** Maximum nesting depth permitted for Lens-based path generation. */
  MAX_PATH_DEPTH: 8,
} as const);

/**
 * Epoch-based staleness tracking constants.
 *
 * Logic:
 * We use an incrementing integer (Epoch) to track state drift. If a node's
 * epoch differs from its recorded dependency epoch, it is considered stale.
 *
 * @internal
 */
export const EPOCH_CONSTANTS = Object.freeze({
  /** Initial state indicating no computation has occurred yet. */
  UNINITIALIZED: -1,
  /** The starting value for valid epochs to avoid falsy (0) ambiguity. */
  MIN: 1,
} satisfies Record<string, number>);

/**
 * Logic: Checks for runtime debug overrides via global variables or storage.
 * This allows toggling debug mode in production browsers for troubleshooting.
 */
const getRuntimeDebug = (): boolean => {
  try {
    return !!(
      (typeof globalThis !== 'undefined' &&
        (globalThis as unknown as { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__) ||
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__ATOM_DEBUG__') === 'true')
    );
  } catch {
    return false;
  }
};

/**
 * Logic: Detects bundler-injected environment flags (e.g., Vite/Webpack).
 */
const getImportMetaDev = (): boolean => {
  try {
    return !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  } catch {
    return false;
  }
};

/**
 * Aggregated signals used to resolve the library environment.
 */
const DEV_SIGNALS = {
  node: typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production',
  bundler: typeof __DEV__ !== 'undefined' && !!__DEV__,
  esm: typeof process === 'undefined' && getImportMetaDev(),
  runtime: getRuntimeDebug(),
} as const;

/**
 * A diagnostic flag indicating if development features should be enabled.
 *
 * Impact:
 * When true, the engine enables extra validation, loop detection, and
 * descriptive error logging that is stripped or disabled in production.
 */
export const IS_DEV =
  DEV_SIGNALS.node || DEV_SIGNALS.bundler || DEV_SIGNALS.esm || DEV_SIGNALS.runtime;

declare const __DEV__: boolean;
