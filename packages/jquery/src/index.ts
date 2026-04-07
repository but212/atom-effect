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
import '@/core/namespace'; // $.atom, $.computed, etc.
import '@/bindings/chainable'; // $.fn.atomText, etc.
import '@/bindings/list'; // $.fn.atomList
import '@/bindings/mount'; // $.fn.atomMount
import '@/features/route'; // $.route
import '@/features/fetch'; // $.atomFetch

import { enablejQueryOverrides } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

// Global initialization on DOM ready.
$(() => {
  enablejQueryOverrides();
  if (document.body) {
    enableAutoCleanup(document.body);
  }
});

export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { nextTick } from '@/core/namespace';
export type {
  BindingOptions,
  ComponentFn,
  ComputedAtom,
  CssBindings,
  CssValue,
  EffectCleanup,
  EffectResult,
  EqualFn,
  FetchOptions,
  ListOptions,
  PrimitiveValue,
  ReactiveValue,
  ReadonlyAtom,
  RenderRoute,
  RouteConfig,
  RouteDefinition,
  RouteLifecycle,
  Router,
  TemplateRoute,
  ValOptions,
  WritableAtom,
} from '@/types';
export { isReactive } from '@/utils';
export { disableAutoCleanup, enableAutoCleanup, registry };

export default $;
