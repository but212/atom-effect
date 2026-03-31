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
import type { AtomOptions, WritableAtom } from '@/types';
// isReactive is defined in utils.ts because core's isAtom already covers computed
// atoms (ComputedAtom carries ATOM_BRAND), making a separate isComputed check redundant.
import { isReactive } from '@/utils';
import { debug } from '@/utils/debug';
import { atomLens, composeLens, lensFor } from './lens';

// ============================================================================
// atom factory + debug namespace
// ============================================================================

/**
 * Local wrapper around core's `atom` factory.
 *
 * This wrapper exists to attach the `$.atom.debug` accessor directly to the
 * function object at runtime. TypeScript requires a double cast for this
 * augmentation, but `NamespaceExtensions` ensures all other fields are type-safe.
 *
 * `options` is not defaulted here — core's `atom` defaults `options` to `{}`
 * internally, so passing `undefined` is safe and avoids an extra allocation
 * per call.
 */
function atom<T>(v: T, opts?: AtomOptions): WritableAtom<T> {
  return createAtom(v, opts);
}

Object.defineProperty(atom, 'debug', {
  enumerable: true,
  configurable: true,
  get: () => debug.enabled,
  set: (v: boolean) => {
    debug.enabled = v;
  },
});

/** Resolves after microtask effects flush. Fast Promise-based scheduling. */
export const nextTick = (): Promise<void> => Promise.resolve();

// Register static extensions to jQuery
$.extend({
  atom: atom as unknown as JQueryStatic['atom'],
  computed,
  effect,
  batch,
  untracked,
  isAtom,
  isComputed,
  isReactive,
  nextTick,
  atomLens,
  composeLens,
  lensFor,
});
