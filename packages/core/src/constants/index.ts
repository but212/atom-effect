/**
 * @module Constants
 *
 * This module acts as the central entry point for all constants used by the
 * reactive engine.
 *
 * Categories:
 * - Branding: Internal type-branding symbols and bit-flags.
 * - Common: Shared primitives, async states, and default configurations.
 * - Env: Environment detection logic and performance tuning thresholds.
 * - Flags: Low-level bitfield definitions for ReactiveNode state.
 * - Scheduler: State machine flags and stability limits for the update loop.
 */

export * from './branding';
export * from './common';
export * from './env';
export * from './errors';
export * from './flags';
export * from './scheduler';
