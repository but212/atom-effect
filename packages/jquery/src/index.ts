/**
 * atom-effect-jquery
 *
 * Brings reactivity to jQuery.
 *
 * Features:
 * - Full CJK IME Support (Input Method Editor).
 * - Auto-cleanup via MutationObserver (No memory leaks).
 * - Debug Mode: Console logging + Visual Highlighting.
 */

import $ from 'jquery';

// Register plugins
import './namespace';
import './chainable';
import './unified';
import './list';
import './mount';

import { enablejQueryOverrides } from './jquery-patch';
// Auto-cleanup (Crucial!)
import { disableAutoCleanup, enableAutoCleanup, registry } from './registry';

// Auto-enable on DOM ready
enablejQueryOverrides();
$(() => {
  enableAutoCleanup(document.body);
});

// Explicit import support
export {
  atom,
  batch,
  computed,
  effect,
  untracked,
} from '@but212/atom-effect';
// Optional: Auto-batching for jQuery events
export { enablejQueryBatching, enablejQueryOverrides } from './jquery-patch';
// Export types
export type {
  BindingOptions,
  ComponentFn,
  ComputedAtom,
  ListOptions,
  ReadonlyAtom,
  WritableAtom,
} from './types';

export { registry, enableAutoCleanup, disableAutoCleanup };
export default $;
