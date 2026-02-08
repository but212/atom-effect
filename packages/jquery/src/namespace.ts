import {
  batch,
  computed,
  atom as createAtom,
  effect,
  isAtom,
  isComputed,
  untracked,
} from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import type { AtomOptions, WritableAtom } from './types';

/**
 * Creates an atom with optional metadata.
 */
function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return createAtom(initialValue, options);
}

// Add debug property
Object.defineProperty(atom, 'debug', {
  get() {
    return debug.enabled;
  },
  set(value: boolean) {
    debug.enabled = value;
  },
});

/**
 * Waits for the next microtask (tick).
 * Useful for waiting for batched updates to complete in tests or async logic.
 * logic: Uses setTimeout to ensure it runs after all microtasks (where effects are processed).
 */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  nextTick,
});
