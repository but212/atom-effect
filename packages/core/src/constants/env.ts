/**
 * Optimization: V8 SMI (Small Integer) Limit
 *
 * Values within this range (up to 30-bit signed) are stored directly in CPU registers
 * by V8, bypassing heap allocation and boxing overhead.
 *
 * @internal
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Thresholds for development-time diagnostics.
 * @internal
 */
export const DEBUG_CONFIG = Object.freeze({
  /** Enables console warnings when potential infinite loops are detected. */
  WARN_INFINITE_LOOP: true,
  /** The time window (ms) for monitoring update frequency. */
  EFFECT_FREQUENCY_WINDOW: 1000,
  /** The update count limit before triggering a loop warning. */
  LOOP_THRESHOLD: 100,
} satisfies Record<string, boolean | number>);

/**
 * Internal configuration for dependency buffers and lookup heuristics.
 * @internal
 */
export const BUFFER_CONFIG = Object.freeze({
  /** The threshold for switching from linear search to Map-based lookup. */
  MAP_THRESHOLD: 8,
});

/**
 * Internal configuration for Lenses and path resolution.
 * @internal
 */
export const LENS_CONFIG = Object.freeze({
  /** Maximum depth for recursive path generation to prevent stack overflow. */
  MAX_PATH_DEPTH: 8,
});

/**
 * Sentinel values for epoch-based staleness tracking.
 *
 * Logic: Drift Detection
 * Epochs are used to determine if a dependency has changed since the last
 * computation without needing deep comparison.
 *
 * @internal
 */
export const EPOCH_CONSTANTS = Object.freeze({
  /** Initial state indicating no computation has occurred. */
  UNINITIALIZED: -1,
  /** Reset floor for epoch counters to avoid 0/falsy confusion. */
  MIN: 1,
});

/**
 * Logic: Runtime Debug Override
 * Checks for explicit debug flags in the global environment or session storage.
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
 * Logic: Environment Metadata
 * Heuristic detection of bundler-injected development environment flags.
 */
const getImportMetaDev = (): boolean => {
  try {
    return !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  } catch {
    return false;
  }
};

/**
 * Logic: Multi-Environment Resolution
 * Aggregates signals from Node.js, Vite/Web-pack, ESM, and manual runtime overrides.
 */
const DEV_SIGNALS = {
  node: typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production',
  bundler: typeof __DEV__ !== 'undefined' && !!__DEV__,
  esm: typeof process === 'undefined' && getImportMetaDev(),
  runtime: getRuntimeDebug(),
} as const;

/**
 * Indicates if the library is running in a development environment.
 * When true, additional validation, diagnostic warnings, and loop protections are active.
 */
export const IS_DEV =
  DEV_SIGNALS.node || DEV_SIGNALS.bundler || DEV_SIGNALS.esm || DEV_SIGNALS.runtime;

declare const __DEV__: boolean;
