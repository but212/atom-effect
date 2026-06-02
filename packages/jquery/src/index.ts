/**
 * @module AEJEntry
 *
 * Responsibility:
 * Main entry point for the `atom-effect-jquery` package. Orchestrates library
 * initialization, global JQuery patches, and reactive registry lifecycles.
 *
 * Design Intent:
 * Provides a low-friction "drop-in" experience for existing JQuery projects
 * while maintaining strict memory safety through MutationObserver-based
 * automatic cleanup.
 */
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
import {
  disableAutoCleanup,
  enableAutoCleanup,
  registry,
  setAutoCleanupAllowed,
} from './core/registry';

/**
 * Role: Library Orchestrator
 * Initializes Atom-Effect jQuery with the specified configuration.
 *
 * When to use:
 * - At the application entry point to configure global reactive behavior.
 * - During runtime to toggle debugging or change auto-cleanup roots.
 *
 * Caution: Memory Leaks
 * If both `patch` and `autoCleanup` are disabled, the engine cannot track
 * DOM removal. You MUST call `cleanup(element)` manually to prevent
 * memory leaks.
 *
 * @param config - Configuration options for patches and cleanup safety nets.
 *
 * @example
 * ```typescript
 * import { initAEJ } from '@but212/atom-effect-jquery';
 *
 * initAEJ({
 *   patch: { html: true, text: true },
 *   autoCleanup: { root: document.getElementById('app') }
 * });
 * ```
 */
export function initAEJ(config: AEJConfig = {}): void {
  const { patch = true, autoCleanup = true } = config;

  // Reason: Disable existing overrides first to ensure a clean state and prevent
  // double-patching if the library is re-initialized with different settings.
  disablejQueryOverrides();
  if (patch !== false) {
    const patchOpts = typeof patch === 'object' ? patch : {};
    enablejQueryOverrides(patchOpts);
  }

  // Security: The MutationObserver safety net is the primary defense against memory
  // leaks in long-running Single Page Applications (SPAs).
  disableAutoCleanup();
  if (autoCleanup === false) {
    setAutoCleanupAllowed(false);
  } else {
    setAutoCleanupAllowed(true);
    const root = typeof autoCleanup === 'object' ? autoCleanup.root : document.body;
    if (root) {
      enableAutoCleanup(root);
      registry.setAutoCleanupScheduled(true);
    }
  }
}

// Logic: Legacy Auto-Initialization
// Automatically initializes the library on DOM ready to support traditional
// JQuery script tag usage. Can be disabled via global configuration.
$(() => {
  const win = window as unknown as { AEJ_NO_AUTO_INIT?: boolean };
  if (!win.AEJ_NO_AUTO_INIT) initAEJ();
});

export { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
export { disableAutoCleanup, enableAutoCleanup } from '@/core/registry';

/**
 * Role: Manual Memory Management
 * Performs a deep recursive cleanup on a node and its entire Shadow DOM subtrees.
 *
 * When to use:
 * - If `autoCleanup` is disabled and you are removing elements from the DOM.
 * - To immediately release reactive resources before a large container removal.
 *
 * @param element - The element or JQuery collection to clean up.
 *
 * @example
 * ```typescript
 * import { cleanup } from '@but212/atom-effect-jquery';
 *
 * // Cleanup a specific container after manual removal
 * $('.old-widget').remove();
 * cleanup($('.old-widget'));
 * ```
 */
export function cleanup(element: HTMLElement | JQuery): void {
  if (element instanceof HTMLElement) {
    registry.cleanupTree(element);
  } else {
    element.each((_, el) => registry.cleanupTree(el));
  }
}

$.extend({ initAEJ });

export type {
  ComputedAtom,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

export type {
  AtomComponentController,
  AtomNav,
  AtomNavOptions,
  BindingOptions,
  ComponentFn,
  CssBindings,
  CssValue,
  EffectCleanup,
  EffectResult,
  EqualFn,
  FetchError,
  FetchOptions,
  JQueryScopedSelector,
  ListOptions,
  PrimitiveValue,
  ReactiveValue,
  RouteConfig,
  RouteDefinition,
  RouteLifecycle,
  Router,
  ValOptions,
} from '@/types';

export default $;
