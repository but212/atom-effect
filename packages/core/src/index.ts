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
export { atom } from '@/core/atom';
export { untracked } from '@/core/base';
export { computed, mergeAtoms } from '@/core/computed';
export { effect } from '@/core/effect';
export { atomLens, composeLens, lensFor, mergeLenses } from '@/core/lens';
export type { LensCloneable, Paths, PathValue } from '@/core/lens-path';
export { getPathValue, LENS_CLONE, setDeepValue } from '@/core/lens-path';
export { aeNextTick, batch, scheduler as globalScheduler } from '@/core/scheduler';
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
  Subscriber,
  SubscriberTarget,
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
