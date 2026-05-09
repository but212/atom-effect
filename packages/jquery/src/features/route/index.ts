import $ from 'jquery';
import type { RouteConfig, Router } from '@/types';
import { RouterImpl } from './router';

/**
 * Initializes a reactive router for synchronizing URL state with DOM views.
 *
 * When to use:
 * - Invoke during application bootstrap to define your routing manifest
 *   and bind a target container for dynamic content rendering.
 *
 * Logic: Reactive Routing
 * This manager orchestrates URL synchronization, path matching, and dynamic
 * view rendering. It exposes reactive atoms (`currentRoute`, `params`)
 * allowing the rest of your UI to respond automatically to navigation changes.
 *
 * Capabilities:
 * - Multi-mode support: Modern 'history' (clean URLs) or 'hash' for legacy/static hosting.
 * - Dynamic matching: High-performance parameter extraction for named segments.
 * - Lifecycle guards: Navigation control via `onEnter` and `onLeave` hooks.
 * - Accessibility: Built-in focus management for Screen Readers on route transitions.
 *
 * @param config - Configuration for routes, target containers, and lifecycle hooks.
 * @returns A router interface for programmatic control and state monitoring.
 *
 * @example
 * ```typescript
 * const router = $.route({
 *   target: '#app-root',
 *   routes: {
 *     '/': { template: '#home-tmpl' },
 *     '/user/:id': {
 *       onEnter: (params) => console.log('Entering user:', params.id),
 *       render: (el, name, params) => {
 *         $(el).text(`User Profile: ${params.id}`);
 *       }
 *     }
 *   }
 * });
 *
 * // Programmatic navigation
 * router.navigate('/user/42');
 * ```
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

$.extend({ route });
