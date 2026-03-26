/**
 * atom-effect-jquery
 *
 * Brings reactivity to jQuery.
 *
 * Features:
 * - Full CJK IME Support (Input Method Editor).
 * - Auto-cleanup via MutationObserver (No memory leaks).
 * - Debug Mode: Console logging + Visual Highlighting.
 *
 * Type augmentation note:
 * This package extends both `JQuery` and `JQueryStatic` via global interface
 * merging in `types.ts`. Consumers using the `export default $` path will
 * receive the augmented type automatically because the module's side-effect
 * imports apply the augmentation at import time.
 */

import $ from 'jquery';

// ============================================================================
// Plugin registrations (order matters — namespace must come first)
// ============================================================================

// Registers $.atom, $.computed, $.effect, $.batch, $.untracked,
// $.isAtom, $.isComputed, $.isReactive, $.nextTick
import '@/core/namespace';

// Registers $.fn.atomText/Html/Class/Css/Attr/Prop/Show/Hide/Val/Checked/On/Bind/Unbind.
import '@/bindings/chainable';

// Registers $.fn.atomList
import '@/bindings/list';

// Registers $.fn.atomMount / $.fn.atomUnmount
import '@/bindings/mount';

// Registers $.route
import '@/features/route';

// Registers $.atomFetch
import '@/features/fetch';

// ============================================================================
// Runtime initialisation (browser only)
// ============================================================================

import { enablejQueryOverrides } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

// $() runs after DOMContentLoaded, so document.body is guaranteed non-null here.
// In JSDOM/test environments jQuery calls the callback synchronously.
$(() => {
  // Wraps jQuery event dispatch in batch() so that rapid user interactions
  // (e.g. typing in an input) batch atom writes into a single reactive flush.
  enablejQueryOverrides();

  // Watches document.body for removed elements and disposes their reactive
  // bindings automatically, preventing memory leaks without manual cleanup.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  enableAutoCleanup(document.body!);
});

// ============================================================================
// ESM exports — values
// ============================================================================

// Core primitives — re-exported so consumers do not need to depend on
// @but212/atom-effect directly.
export {
  atom,
  batch,
  computed,
  effect,
  isAtom,
  isComputed,
  untracked,
} from '@but212/atom-effect';

// jQuery override controls — called automatically on DOM ready, but exposed
// here for consumers who manage initialisation themselves (e.g. custom roots,
// shadow DOMs, or environments where the automatic call is not appropriate).
export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { atomLens, composeLens } from '@/core/lens';
export { nextTick } from '@/core/namespace';
export { isReactive } from '@/utils';

// Registry API — for advanced lifecycle control (custom roots, manual cleanup).
// Note: enableAutoCleanup is called automatically on DOM ready with document.body.
// Call it again only if you need a different root or want to re-initialise.
export { disableAutoCleanup, enableAutoCleanup, registry };

// ============================================================================
// ESM exports — types
// ============================================================================

// Public-facing types — includes everything needed to fully type-check calls
// to every exported function and jQuery plugin method.
export type {
  // Binding authoring
  BindingOptions,
  ComponentFn,
  // Reactive primitives (core)
  ComputedAtom,
  CssBindings,
  CssValue,
  DeepPath,
  EffectCleanup,
  EffectResult,
  EqualFn,
  // Fetch
  FetchOptions,
  // List
  ListOptions,
  PrimitiveValue,
  ReactiveValue,
  ReadonlyAtom,
  // Routing
  RenderRoute,
  RouteConfig,
  RouteDefinition,
  RouteLifecycle,
  Router,
  TemplateRoute,
  ValOptions,
  WritableAtom,
} from '@/types';

// The augmented jQuery object. Consumers importing this receive a $ with all
// atom-effect plugin methods already typed via global interface merging.
export default $;
