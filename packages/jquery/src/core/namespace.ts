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
 * When to use:
 * - Waiting until all pending effects have finished updating the DOM.
 * - Coordinating manual DOM measurements with reactive state changes.
 *
 * @public
 */
export const nextTick = (): Promise<void> => aeNextTick();

/**
 * Reason: Provides a unified development experience by allowing developers
 * to access both reactive state management and DOM manipulation through
 * the standard `$` namespace, reducing context switching and boilerplate.
 *
 * @example
 * ```typescript
 * // Reactive state management via jQuery namespace
 * const count = $.atom(0);
 *
 * $.effect(() => {
 *   $('#counter').text(count.value);
 * });
 *
 * count.value++;
 * ```
 *
 * @public
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
