/**
 * @module AEJNamespace
 *
 * Responsibility:
 * Extends the global jQuery ($) object with reactive state management
 * primitives from the core atom-effect library.
 */

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
  isEffect,
  lensFor,
  mergeAtoms,
  mergeLenses,
  untracked,
} from '@but212/atom-effect';
import { isPromise } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { debug } from '@/utils/debug';

/**
 * Logic: Asynchronous Update Synchronization
 * Returns a promise that resolves after the next reactive update cycle.
 *
 * When to use:
 * - Perform manual DOM measurements after reactive changes.
 * - Coordinate external library initializations dependent on current DOM state.
 */
export const nextTick = (): Promise<void> => aeNextTick();

/**
 * Logic: Unified Reactive Namespace
 * Extends jQuery with reactive primitives to allow managing state
 * and DOM within a single, familiar context.
 *
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
  isEffect,
  isPromise,
  nextTick,
  atomLens,
  composeLens,
  lensFor,
  mergeAtoms,
  mergeLenses,
  debug,
});
