/**
 * @fileoverview Reactive state management library - Main entry point
 * @description Fine-grained reactive system with Atoms, Computed values, and Effects
 *
 * @example
 * ```ts
 * import { atom, computed, effect, batch } from '@but212/reactive-atom';
 *
 * // Create reactive state
 * const count = atom(0);
 * const doubled = computed(() => count.value * 2);
 *
 * // React to changes
 * effect(() => {
 *   console.log(`Count: ${count.value}, Doubled: ${doubled.value}`);
 * });
 *
 * // Batch updates
 * batch(() => {
 *   count.value = 5;
 * });
 * ```
 */

// ========================================
// Constants & Configuration
// ========================================
export { AsyncState, DEBUG_CONFIG, POOL_CONFIG, SCHEDULER_CONFIG } from './constants';
// ========================================
// Core Functions
// ========================================
export { atom } from './core/atom';
export { computed } from './core/computed';
export { effect } from './core/effect';
// ========================================
// Error Classes
// ========================================
export { AtomError, ComputedError, EffectError, SchedulerError } from './errors/errors';
// ========================================
// Helper Functions
// ========================================
export { batch, isAtom, isComputed, isEffect, untracked } from './helpers/helpers';
// ========================================
// Type Definitions
// ========================================
export type {
  AsyncStateType,
  AtomOptions,
  ComputedAtom,
  ComputedOptions,
  DebugConfig,
  EffectFunction,
  EffectObject,
  EffectOptions,
  ReadonlyAtom,
  TransformFunction,
  WritableAtom,
} from './types';
// ========================================
// Debug Utilities (for testing and development)
// ========================================
export { debug as DEBUG_RUNTIME } from './utils/debug';
// ========================================
// Utilities
// ========================================
export { scheduler } from './utils/scheduler';
