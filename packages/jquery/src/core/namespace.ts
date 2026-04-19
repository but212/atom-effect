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
 * Returns a promise that resolves after the next reactive tick.
 * Useful for waiting until all pending effects have updated the DOM.
 */
export const nextTick = (): Promise<void> => aeNextTick();

/**
 * Integrates Atom-Effect reactive primitives into the global jQuery object.
 *
 * Why: This allows a unified development experience, where state management
 * and DOM manipulation can both be accessed through the standard '$' object.
 *
 * @example
 * // Reactive state management via jQuery
 * const count = $.atom(0);
 * $.effect(() => {
 *   $('#counter').text(count.value);
 * });
 *
 * count.value++;
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
