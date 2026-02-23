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
// isReactive is defined in utils.ts because core's isAtom already covers computed
// atoms (ComputedAtom carries ATOM_BRAND), making a separate isComputed check redundant.
import { isReactive } from './utils';

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
function atom<T>(initialValue: T, options?: AtomOptions): WritableAtom<T> {
  return createAtom(initialValue, options);
}

Object.defineProperty(atom, 'debug', {
  enumerable: true,
  // configurable: true allows tests and advanced consumers to redefine or
  // delete the accessor if needed. The default (false) would permanently lock
  // the property on the function object.
  configurable: true,
  get(): boolean {
    return debug.enabled;
  },
  set(value: boolean) {
    debug.enabled = value;
  },
});

// ============================================================================
// nextTick
// ============================================================================

/**
 * Resolves after all pending microtask-scheduled reactive effects have flushed.
 *
 * Implementation uses `setTimeout(0)` (a macrotask) which always runs after
 * the current microtask queue is drained. This is intentional: core's
 * scheduler enqueues effects as microtasks, so by the time the macrotask
 * fires, all pending reactive propagation for the current turn is complete.
 *
 * Note: browsers may enforce a minimum 4 ms delay for nested `setTimeout`
 * calls. For unit tests this is typically not an issue. If sub-millisecond
 * resolution is needed, use `Promise.resolve()` directly to wait for a single
 * microtask tick instead.
 *
 * **Caveats**: A single `await nextTick()` covers one reactive propagation
 * wave. Chains of computed → effect → atom → effect may require multiple
 * awaits — one per propagation step.
 */
export function nextTick(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ============================================================================
// Static extension registration
// ============================================================================

/**
 * The subset of `JQueryStatic` that this module registers.
 *
 * Typed as `Pick<JQueryStatic, ...>` so that the compiler verifies:
 * 1. Every key listed here actually exists on `JQueryStatic`.
 * 2. Every value's type is assignable to the declared `JQueryStatic` member.
 *
 * Adding or removing a key in either `JQueryStatic` or this object without
 * updating the other produces a compile-time error.
 *
 * Dependency direction note: `nextTick` is defined locally in this file, so
 * `JQueryStatic['nextTick']` is validated against its signature. For most other
 * keys, `JQueryStatic` serves as the source of truth for typing.
 *
 * Note: `$.extend(staticExtensions)` merges the fields into `$` at runtime.
 * TypeScript does not model this mutation on the `$` type — the augmented
 * types are declared separately via global interface merging in `types.ts`.
 */
type NamespaceExtensions = Pick<
  JQueryStatic,
  | 'atom'
  | 'computed'
  | 'effect'
  | 'batch'
  | 'untracked'
  | 'isAtom'
  | 'isComputed'
  | 'isReactive'
  | 'nextTick'
>;

const staticExtensions: NamespaceExtensions = {
  // Double cast required for the `atom` function due to its runtime `debug`
  // accessor (see JSDoc for `function atom` above). All other fields are
  // fully verified by `NamespaceExtensions`.
  atom: atom as unknown as JQueryStatic['atom'],
  computed,
  effect,
  batch,
  untracked,
  isAtom,
  isComputed,
  isReactive,
  nextTick,
};

// $.extend(obj) merges into JQueryStatic (i.e. the $ function itself).
// Use $.fn.extend(obj) instead to add instance methods on jQuery collections.
$.extend(staticExtensions);
