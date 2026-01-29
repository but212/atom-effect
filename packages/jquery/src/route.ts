import { atom as createAtom, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from './registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from './types';

/**
 * Log prefix for router warnings and errors.
 */
const LOG_PREFIX = '[$.route]';

/**
 * Creates a hash-based SPA router with reactive state management.
 *
 * This removes boilerplate from manual route handling by:
 * - Automatically tracking hash changes and updating the UI
 * - Managing template rendering with lifecycle hooks
 * - Handling active link states reactively
 * - Providing navigation guard support (onLeave)
 *
 * @param config - Router configuration
 * @returns Router instance with navigate, destroy methods and currentRoute atom
 *
 * @example
 * ```ts
 * const router = $.route({
 *   target: '#app',
 *   default: 'home',
 *   routes: {
 *     home: { template: '#tmpl-home' },
 *     about: { template: '#tmpl-about' }
 *   }
 * });
 *
 * // Navigate programmatically
 * router.navigate('about');
 *
 * // React to route changes
 * $.effect(() => {
 *   console.log('Current route:', router.currentRoute.value);
 * });
 *
 * // Cleanup when done
 * router.destroy();
 * ```
 */
export function route(config: RouteConfig): Router {
  // Destructure configuration with defaults
  const {
    target,
    default: defaultRoute,
    routes,
    notFound,
    autoBindLinks = false,
    activeClass = 'active',
    beforeTransition,
    afterTransition,
  } = config;

  // ============================================================================
  // State Management
  // ============================================================================

  let isDestroyed = false;
  let previousRoute: string | null = null;
  let previousHash: string = window.location.hash;
  const cleanups: Array<() => void> = [];
  const boundLinks: HTMLElement[] = []; // Track links for cleanup via registry

  // DOM references
  const $target = $(target);

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Extracts route name from current hash.
   */
  const getHashRoute = (): string => {
    const hash = window.location.hash.substring(1);
    const [routeName] = hash.split('?');
    return routeName || defaultRoute;
  };

  /**
   * Parses query parameters from hash string.
   * @example parseQueryParams('home?id=123&name=test') // { id: '123', name: 'test' }
   */
  const parseQueryParams = (hash: string): Record<string, string> => {
    const [, queryString] = hash.split('?');
    if (!queryString) return {};

    const params: Record<string, string> = {};
    queryString.split('&').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    });
    return params;
  };

  /**
   * Resolves route configuration, falling back to notFound route if needed.
   */
  const getRouteConfig = (routeName: string): RouteDefinition | null => {
    let routeConfig = routes[routeName];

    // Fallback to notFound route if route doesn't exist
    if (!routeConfig && notFound) {
      routeConfig = routes[notFound];
    }

    if (!routeConfig) {
      console.warn(`${LOG_PREFIX} Route "${routeName}" not found and no notFound route configured`);
      return null;
    }

    return routeConfig;
  };

  /**
   * Renders template content into target container.
   * @returns true if template was found and rendered, false otherwise
   */
  const renderTemplate = (templateSelector: string): boolean => {
    const template = document.querySelector(templateSelector) as HTMLTemplateElement;

    if (!template?.content) {
      console.warn(`${LOG_PREFIX} Template "${templateSelector}" not found`);
      return false;
    }

    const clonedContent = template.content.cloneNode(true) as DocumentFragment;
    $target.append(clonedContent);
    return true;
  };

  // ============================================================================
  // Reactive State
  // ============================================================================

  const currentRoute: WritableAtom<string> = createAtom(getHashRoute());

  // ============================================================================
  // Core Routing Functions
  // ============================================================================

  /**
   * Renders the specified route, including lifecycle hooks and content.
   * This is the main rendering function that orchestrates the entire render cycle.
   */
  const renderRoute = (routeName: string): void => {
    if (isDestroyed) return;

    // Validate target element exists
    const container = $target[0];
    if (!container) {
      console.warn(`${LOG_PREFIX} Target element "${target}" not found`);
      return;
    }

    // Resolve route configuration
    const routeConfig = getRouteConfig(routeName);
    if (!routeConfig) return;

    // Parse query parameters
    const params = parseQueryParams(window.location.hash.substring(1));

    // Call beforeTransition hook
    if (beforeTransition) {
      beforeTransition(previousRoute || routeName, routeName);
    }

    // Clear current content
    $target.html('');

    // Call onEnter hook and merge params
    let routeParams = params;
    if (routeConfig.onEnter) {
      const result = routeConfig.onEnter(params);
      if (result !== undefined) {
        routeParams = { ...params, ...result };
      }
    }

    // Render content (custom render or template)
    if (routeConfig.render) {
      routeConfig.render(container, routeName, routeParams);
    } else if (routeConfig.template) {
      renderTemplate(routeConfig.template);
    }

    // Call afterTransition hook
    if (afterTransition) {
      afterTransition(previousRoute || routeName, routeName);
    }

    // Update previous route for next transition
    previousRoute = routeName;
  };

  /**
   * Navigates to the specified route programmatically.
   * Respects navigation guards (onLeave hooks).
   */
  const navigate = (routeName: string): void => {
    if (isDestroyed) return;

    // Check if leaving current route is allowed
    const currentRouteName = currentRoute.value;
    const currentRouteConfig = routes[currentRouteName];

    if (currentRouteConfig?.onLeave) {
      const canLeave = currentRouteConfig.onLeave();
      if (canLeave === false) return; // Navigation blocked
    }

    // Update hash and state
    window.location.hash = `#${routeName}`;
    previousHash = window.location.hash;
    currentRoute.value = routeName; // Update immediately for synchronous behavior
  };

  /**
   * Handles browser hash change events.
   */
  const handleHashChange = (): void => {
    if (isDestroyed) return;

    const currentHash = window.location.hash;
    if (currentHash === previousHash) return; // No actual change

    previousHash = currentHash;
    const newRoute = getHashRoute();

    if (currentRoute.value !== newRoute) {
      // Route name changed, update reactive state (will trigger render)
      currentRoute.value = newRoute;
    } else {
      // Same route but hash changed (e.g., query params), manually re-render
      renderRoute(newRoute);
    }
  };

  // ============================================================================
  // Initialization & Setup
  // ============================================================================

  /**
   * Sets up automatic binding for navigation links with data-route attribute.
   * Creates reactive effects for active state tracking and click handlers.
   * Links are registered with the cleanup registry for automatic memory management.
   */
  const setupAutoBindLinks = (): void => {
    if (!autoBindLinks) return;

    const $links = $('[data-route]');

    $links.each(function () {
      const el = this as HTMLElement;
      const $link = $(el);
      const routeAttr = $link.data('route') as string;

      // Track this link for cleanup
      boundLinks.push(el);

      // Bind click handler for navigation
      const clickHandler = (e: JQuery.TriggeredEvent) => {
        e.preventDefault();
        navigate(routeAttr);
      };
      $link.on('click', clickHandler);

      // Register cleanup with registry for auto-cleanup when link is removed from DOM
      registry.trackCleanup(el, () => $link.off('click', clickHandler));

      // Bind reactive active state tracking
      const activeEffect = effect(() => {
        const isActive = currentRoute.value === routeAttr;
        $link.toggleClass(activeClass, isActive);

        // Update aria-current for accessibility
        if (isActive) {
          $link.attr('aria-current', 'page');
        } else {
          $link.removeAttr('aria-current');
        }
      });

      // Register effect with registry for auto-cleanup when link is removed from DOM
      registry.trackEffect(el, activeEffect);
    });
  };

  /**
   * Cleans up all event listeners and effects.
   * Safe to call multiple times.
   */
  const destroy = (): void => {
    if (isDestroyed) return;
    isDestroyed = true;

    // Cleanup router-level effects (hashchange listener, render effect)
    cleanups.forEach((cleanup) => cleanup());
    cleanups.length = 0;

    // Cleanup bound links via registry
    // This handles both click handlers and active state effects
    boundLinks.forEach((el) => registry.cleanup(el));
    boundLinks.length = 0;
  };

  // ============================================================================
  // Router Initialization
  // ============================================================================

  // Set up hash change listener
  window.addEventListener('hashchange', handleHashChange);
  cleanups.push(() => window.removeEventListener('hashchange', handleHashChange));

  // Initialize: Set up reactive rendering effect
  const renderEffect = effect(() => {
    renderRoute(currentRoute.value);
  });
  cleanups.push(() => renderEffect.dispose());

  // Auto-bind navigation links
  setupAutoBindLinks();

  // Auto-cleanup router if target element is removed
  if ($target[0]) {
    registry.trackCleanup($target[0], destroy);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    currentRoute,
    navigate,
    destroy,
  };
}

/**
 * Register as jQuery static method.
 */
$.extend({
  route,
});
