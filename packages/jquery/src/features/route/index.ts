/**
 * @module AEJRoute
 *
 * Responsibility:
 * Main entry point for the AEJ routing system. Provides the jQuery extension
 * for initializing reactive routers.
 */

import $ from 'jquery';
import type { RouteConfig, Router } from '@/types';
import { RouterImpl } from './router';

/**
 * - Multi-mode support: Modern 'history' or 'hash' for legacy environments.
 * - Dynamic matching: High-performance parameter extraction via tiered compilers.
 * - Lifecycle guards: Navigation control via `onEnter` and `onLeave` hooks.
 * - Accessibility: Built-in focus and scroll management on transitions.
 *
 * @example
 * ```typescript
 * const router = $.route({
 *   target: '#app',
 *   routes: {
 *     '/': { template: '#home-tmpl' },
 *     '/users/:id': { render: (el, name, params) => renderUser(el, params.id) }
 *   }
 * });
 * ```
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

$.extend({ route });
