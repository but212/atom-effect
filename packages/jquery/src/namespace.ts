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
import { isReactive } from './utils';

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
 * Waits for the next macrotask (setTimeout 0).
 * Effects are processed in microtasks, so this runs AFTER all pending effects complete.
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
  isReactive,
  nextTick,
});
