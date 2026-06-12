/**
 * @module CoreEngine
 *
 * Responsibility:
 * Central entry point for the atom-effect core reactive engine.
 * Aggregates and exposes public APIs for state management (Atoms),
 * derived state (Computeds), side-effects (Effects), and deep state
 * projection (Lenses).
 *
 * Design Intent:
 * Provides a unified and curated interface for library consumers while
 * encapsulating internal engine implementation details.
 */

export { atom } from './atom';
export {
  createDependencyLink,
  nextVersion,
  runInTrackingContext,
  trackingContext,
  untracked,
} from './base';
export { computed, mergeAtoms } from './computed';
export { effect } from './effect';
export type { Paths, PathValue } from './lens';
export {
  atomLens,
  composeLens,
  getPathValue,
  lensFor,
  mergeLenses,
  setDeepValue,
} from './lens';
export {
  aeNextTick,
  batch,
  nextEpoch,
  scheduler,
  schedulerIsBatching,
  schedulerSchedule,
} from './scheduler';
