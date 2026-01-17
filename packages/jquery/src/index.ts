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


// Auto-cleanup (Crucial!)
import { enableAutoCleanup, disableAutoCleanup, registry } from './registry';
import { enablejQueryOverrides } from './jquery-patch';

// Auto-enable on DOM ready
enablejQueryOverrides();
$(() => {
  enableAutoCleanup(document.body);
});

// Explicit import support
export {
  atom,
  computed,
  effect,
  batch,
  untracked
} from '@but212/atom-effect';

// Export types
export type {
  WritableAtom,
  ReadonlyAtom,
  ComputedAtom,
  BindingOptions,
  ListOptions,
  ComponentFn
} from './types';

// Optional: Auto-batching for jQuery events
export { enablejQueryOverrides, enablejQueryBatching } from './jquery-patch';

export { registry, enableAutoCleanup, disableAutoCleanup };
export default $;

