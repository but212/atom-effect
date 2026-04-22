import {
  aeNextTick,
  atom,
  atomLens,
  batch,
  composeLens,
  computed,
  effect,
  isAtom,
  isComputed,
  lensFor,
  untracked,
} from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from '@/utils/debug';

/**
 * Returns a promise that resolves after the next reactive update cycle has completed.
 *
 * When to use:
 * - To perform manual DOM measurements after reactive changes have been applied.
 * - To coordinate external library initializations that depend on the current DOM state.
 *
 * @returns A promise that resolves when the DOM has been synchronized with the latest state.
 */
export const nextTick = (): Promise<void> => aeNextTick();

/**
 * Extends the global jQuery namespace with reactive state management primitives.
 *
 * Reason: This unified namespace allows developers to manage both reactive state
 * and DOM manipulation within the familiar `$` context, reducing the need for
 * additional imports and minimizing context switching.
 *
 * @example
 * ```typescript
 * // Reactive state management via the jQuery namespace
 * const count = $.atom(0);
 *
 * $.effect(() => {
 *   $('#counter-label').text(`Current count: ${count.value}`);
 * });
 *
 * // Trigger an update
 * count.value++;
 * ```
 */
$.extend({
  atom,
  computed,
  effect,
  batch,
  untracked,
  isAtom,
  isComputed,
  nextTick,
  atomLens,
  composeLens,
  lensFor,

  debug,
});
