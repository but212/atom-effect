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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  enableAutoCleanup(document.body!);
});

export { atom, batch, computed, effect, isAtom, isComputed, untracked } from '@but212/atom-effect';
export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { atomLens, composeLens, lensFor } from '@/core/lens';
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
  Paths,
  PathValue,
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
