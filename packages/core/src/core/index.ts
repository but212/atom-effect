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
export { untracked } from './base';
export { computed, mergeAtoms } from './computed';
export { effect } from './effect';
export { atomLens, composeLens, lensFor, mergeLenses } from './lens';
export type { LensCloneable, Paths, PathValue } from './lens-path';
export { getPathValue, LENS_CLONE, setDeepValue } from './lens-path';
export { aeNextTick, batch, scheduler } from './scheduler';
