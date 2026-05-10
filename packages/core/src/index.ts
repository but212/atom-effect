/**
 * @module AtomEffect
 *
 * Responsibility:
 * Primary public entry point for the atom-effect reactive state management
 * library. Flattens the internal package structure into a cohesive public API.
 *
 * Design Intent:
 * Provides consumers with a single point of access to all core primitives
 * including Atoms, Computeds, Effects, Lenses, and utility type guards.
 */

export { AsyncState, BRAND, BrandFlags, IS_DEV, SCHEDULER_CONFIG } from '@/constants';
export type { Paths, PathValue } from '@/core';
export {
  aeNextTick,
  atom,
  atomLens,
  batch,
  composeLens,
  computed,
  effect,
  getPathValue,
  lensFor,
  mergeAtoms,
  mergeLenses,
  scheduler as globalScheduler,
  setDeepValue,
  untracked,
} from '@/core';
export type {
  AsyncStateType,
  AtomErrorJSON,
  AtomOptions,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Disposable,
  EffectCleanup,
  EffectFunction,
  EffectObject,
  EffectOptions,
  MergedDependencyValue,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';
export {
  AtomError,
  ComputedError,
  debug as runtimeDebug,
  EffectError,
  getErrorChain,
  isAtom,
  isComputed,
  isEffect,
  isPromise,
  isWritable,
  SchedulerError,
  serializeError,
} from '@/utils';
