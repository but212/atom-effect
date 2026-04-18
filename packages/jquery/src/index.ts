import $ from 'jquery';

import '@/core/namespace';
import '@/bindings/chainable';
import '@/bindings/list';
import '@/bindings/mount';
import '@/features/route';
import '@/features/fetch';
import '@/features/nav';

import { enablejQueryOverrides } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

$(() => {
  enablejQueryOverrides();
  if (document.body) {
    enableAutoCleanup(document.body);
  }
});

export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { nextTick } from '@/core/namespace';
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
  RenderRoute,
  RouteConfig,
  RouteDefinition,
  RouteLifecycle,
  Router,
  TemplateRoute,
  ValOptions,
  WritableAtom,
} from '@/types';
export { disableAutoCleanup, enableAutoCleanup, registry };

export default $;
