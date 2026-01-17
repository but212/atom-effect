import $ from 'jquery';
import {
  atom as createAtom,
  computed,
  effect,
  batch,
  untracked,
  isAtom,
  isComputed
} from '@but212/atom-effect';
import { debug } from './debug';
import type { AtomOptions, WritableAtom } from './types';

/**
 * Stores Atom metadata (for debugging).
 */
const atomMetadata = new WeakMap<WritableAtom<unknown>, { name?: string }>();

/**
 * Creates an atom with optional metadata.
 */
function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  const instance = createAtom(initialValue, options);
  
  // Store metadata
  if (options.name) {
    atomMetadata.set(instance, { name: options.name });
  }

  // Debug mode: Value change detection
  // Note: Wrapper logic removed due to interference with atom-effect internals (computed reactivity)
  // Revisit if safer interception method is found.
  /*
  if (debug.enabled || options.name) {
    // ... removed ...
  }
  */

  return instance;
}

// Add debug property
Object.defineProperty(atom, 'debug', {
  get() {
    return debug.enabled;
  },
  set(value: boolean) {
    debug.enabled = value;
  }
});

/**
 * Waits for the next microtask (tick).
 * Useful for waiting for batched updates to complete in tests or async logic.
 * logic: Uses setTimeout to ensure it runs after all microtasks (where effects are processed).
 */
function nextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Extend jQuery static methods.
 */
$.extend({
  atom,
  computed,
  effect,
  batch,
  untracked,
  isAtom,
  isComputed,
  isReactive: (v: unknown) => isAtom(v) || isComputed(v),
  nextTick
});
