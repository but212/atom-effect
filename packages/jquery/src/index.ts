import $ from 'jquery';

import '@/core/namespace';
import '@/bindings/chainable';
import '@/bindings/list';
import '@/bindings/mount';
import '@/features/route';
import '@/features/fetch';
import '@/features/nav';
import '@/features/web-component';

import { enablejQueryOverrides } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

/**
 * Logic: Auto-Initialization
 * Hooks into jQuery's ready event to guarantee that overrides
 * and lifecycle observers are anchored to a valid DOM tree.
 */
$(() => {
  enablejQueryOverrides();
  if (document.body) {
    // Logic: document.body is the standard root for the MutationObserver 'safety-net'.
    enableAutoCleanup(document.body);
  }
});

export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';

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

export default $;
