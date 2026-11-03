/**
 * @module AEJNamespace
 *
 * Responsibility:
 * Extends the global jQuery ($) object with reactive state management
 * primitives from the core atom-effect library.
 */

import {
  atom,
  batch,
  computed,
  effect,
  isAtom,
  isPromise,
  aeNextTick as nextTick,
} from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from '@/utils/debug';

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
  isAtom,
  isPromise,
  nextTick,
  debug,
});
