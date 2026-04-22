import $ from 'jquery';

import '@/core/namespace';
import '@/bindings/chainable';
import '@/bindings/list';
import '@/bindings/mount';
import '@/features/route';
import '@/features/fetch';
import '@/features/nav';
import '@/features/web-component';
import { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
import type { AEJConfig } from '@/types';
import { disableAutoCleanup, enableAutoCleanup, setAutoCleanupAllowed } from './core/registry';

/**
 * Initializes Atom-Effect jQuery with the specified configuration.
 *
 * This function resets the library's state according to the provided config.
 * It is safe to call multiple times to reconfigure features at runtime.
 *
 * @param config - Configuration options.
 * @public
 *
 * @warning If both `patch` and `autoCleanup` are set to `false`, you are
 * responsible for calling `registry.cleanupTree(element)` manually when
 * elements are removed to prevent memory leaks.
 */
export function initAEJ(config: AEJConfig = {}): void {
  const { patch = true, autoCleanup = true } = config;

  // 1. Install jQuery patches (granular options handled inside)
  disablejQueryOverrides();
  if (patch !== false) {
    const patchOpts = typeof patch === 'object' ? patch : {};
    enablejQueryOverrides(patchOpts);
  }

  // 2. Configure MutationObserver safety net
  disableAutoCleanup();
  if (autoCleanup !== false) {
    setAutoCleanupAllowed(true);
    const root = typeof autoCleanup === 'object' ? autoCleanup.root : document.body;
    if (root) enableAutoCleanup(root);
  } else {
    setAutoCleanupAllowed(false);
  }
}

// Logic: Legacy support for automatic initialization.
// Allows opting out via window.AEJ_NO_AUTO_INIT = true.
$(() => {
  const win = window as unknown as { AEJ_NO_AUTO_INIT?: boolean };
  if (!win.AEJ_NO_AUTO_INIT) initAEJ();
});

export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

$.extend({ initAEJ });

export type {
  AtomComponentController,
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
  JQueryScopedSelector,
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

export default $;
