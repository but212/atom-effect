/**
 * atom-effect-jquery: Main Entry Point
 *
 * This module orchestrates the automatic integration of reactive atoms
 * into the jQuery ecosystem. By importing this module, the following
 * actions occur automatically:
 * 1. jQuery prototypes are patched for lifecycle safety.
 * 2. Reactive chainable methods ($().atomText, etc.) are registered.
 * 3. The MutationObserver safety-net is activated for automated cleanup.
 */
import $ from 'jquery';

// side-effectful imports: these register methods and features into the $ namespace.
import '@/core/namespace';
import '@/bindings/chainable';
import '@/bindings/list';
import '@/bindings/mount';
import '@/features/route';
import '@/features/fetch';
import '@/features/nav';

import { enablejQueryOverrides } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

/**
 * Auto-Initialize:
 * Logic: Hooks into jQuery's ready event to guarantee that overrides
 * and lifecycle observers are anchored to a valid DOM tree.
 */
$(() => {
  enablejQueryOverrides();
  if (document.body) {
    // Rationale: document.body is the standard root for the MutationObserver 'safety-net'.
    enableAutoCleanup(document.body);
  }
});

export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { nextTick } from '@/core/namespace';

/**
 * Public API Surface:
 * Re-exports the definitive types used for building reactive components and bindings.
 */
export type {
  AtomNavOptions,
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
  RouteConfig,
  RouteDefinition,
  RouteLifecycle,
  Router,
  ValOptions,
  WritableAtom,
} from '@/types';

export { disableAutoCleanup, enableAutoCleanup, registry };

/** The augmented jQuery object is the default export. */
export default $;
