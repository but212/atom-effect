import type { EffectObject } from '@/types';
import { ArrayPool } from '../utils/array-pool';
import { ObjectPool } from '../utils/object-pool';

// ============================================================================
// Array Pools
// ============================================================================

export const effectsArrayPool = new ArrayPool<EffectObject>();
export const cleanupsArrayPool = new ArrayPool<() => void>();

// ============================================================================
// Object Pools
// ============================================================================

/**
 * Per-element record of all reactive resources that must be released on cleanup.
 * Fields are optional to avoid allocating arrays for the common case where only
 * one resource type is used.
 *
 * Extracted here so that both the pool and registry share the same type.
 */
export interface BindingRecord {
  effects: EffectObject[] | undefined;
  cleanups: Array<() => void> | undefined;
  componentCleanup: (() => void) | undefined;
}

/**
 * Pool for BindingRecord objects.
 * Uses a fixed hidden class for V8 optimization.
 */
export const bindingRecordPool = new ObjectPool<BindingRecord>(
  () => ({ effects: undefined, cleanups: undefined, componentCleanup: undefined }),
  (r) => {
    r.effects = r.cleanups = r.componentCleanup = undefined;
  },
  128
);
