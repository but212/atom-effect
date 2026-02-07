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

  let isDestroyed = false;
  let previousRoute: string | null = null;
  let previousHash: string = window.location.hash;
  const cleanups: Array<() => void> = [];
  const boundLinks = new Set<HTMLElement>(); // Track links for cleanup via registry

  // DOM references
  const $target = $(target);

  /**
   * Extracts route name from current hash.
   * Optimized to avoid array allocations.
   */
  const getHashRoute = (): string => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    const routeName = qIndex === -1 ? hash.substring(1) : hash.substring(1, qIndex);
    return routeName || defaultRoute;
  };

  /**
   * Parses query parameters from hash string.
   * Optimized for low allocation (no intermediate arrays).
   * @example parseQueryParams('#home?id=123&name=test') // { id: '123', name: 'test' }
   */
  const parseQueryParams = (hash: string): Record<string, string> => {
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return {};

    const params: Record<string, string> = {};
    const len = hash.length;
    let start = qIndex + 1;

    // Helper for safe decoding
    const safeDecode = (str: string): string => {
      try {
        return decodeURIComponent(str);
      } catch (e) {
        console.warn(`${LOG_PREFIX} Malformed URI component: ${str}`);
        return str;
      }
    };

    while (start < len) {
      let end = hash.indexOf('&', start);
      if (end === -1) end = len;

      if (end > start) {
        const eqIndex = hash.indexOf('=', start);
        if (eqIndex !== -1 && eqIndex < end) {
          params[safeDecode(hash.substring(start, eqIndex))] = safeDecode(
            hash.substring(eqIndex + 1, end)
          );
        } else {
          params[safeDecode(hash.substring(start, end))] = '';
        }
      }
      start = end + 1;
    }
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

  const currentRoute: WritableAtom<string> = createAtom(getHashRoute());

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
    const params = parseQueryParams(window.location.hash);

    // Call beforeTransition hook
    if (beforeTransition) {
      beforeTransition(previousRoute || routeName, routeName);
    }

    // Clear current content
    $target.empty();

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

    // Update hash and state, and pre-set previousHash to prevent double render
    previousHash = `#${routeName}`;
    window.location.hash = previousHash;
    currentRoute.value = routeName; // Update immediately for synchronous behavior
  };

  /**
   * Handles browser hash change events.
   */
  const handleHashChange = (): void => {
    if (isDestroyed) return;

    const currentHash = window.location.hash;
    if (currentHash === previousHash) return; // No actual change, or already handled by navigate()

    const newRoute = getHashRoute();
    const oldRouteName = currentRoute.value;

    if (oldRouteName !== newRoute) {
      // Check onLeave guard for user-driven navigation
      const oldRouteConfig = routes[oldRouteName];
      if (oldRouteConfig?.onLeave) {
        if (oldRouteConfig.onLeave() === false) {
          // Navigation blocked, revert hash
          window.location.hash = previousHash;
          return;
        }
      }
      currentRoute.value = newRoute;
    } else {
      // Same route but hash changed (e.g., query params), manually re-render
      renderRoute(newRoute);
    }

    previousHash = currentHash;
  };

  /**
   * Sets up automatic binding for navigation links with data-route attribute.
   * Uses event delegation for clicks handling dynamic elements.
   * Uses MutationObserver for active state management of dynamic elements.
   */
  const setupAutoBindLinks = (): void => {
    if (!autoBindLinks) return;

    // 1. Event Delegation for Navigation (Handles future elements automatically)
    const delegateHandler = (e: JQuery.TriggeredEvent) => {
      e.preventDefault();
      const routeAttr = $(e.currentTarget).data('route');
      navigate(routeAttr);
    };

    $(document).on('click', '[data-route]', delegateHandler);

    cleanups.push(() => {
      $(document).off('click', '[data-route]', delegateHandler);
    });

    // 2. Active State Management via MutationObserver
    // We need to attach effects to any [data-route] element that appears in the DOM.
    const bindActiveState = (el: HTMLElement) => {
      if (boundLinks.has(el)) return;

      const $link = $(el);
      const routeAttr = $link.data('route') as string;

      boundLinks.add(el);

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

      // Register effect with registry
      registry.trackEffect(el, activeEffect);

      // Cleanup tracking
      registry.trackCleanup(el, () => {
        boundLinks.delete(el);
      });
    };

    // Initial bind
    $('[data-route]').each(function () {
      bindActiveState(this as HTMLElement);
    });

    // Watch for new elements
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              // ELEMENT_NODE
              const el = node as HTMLElement;
              if (el.matches && el.matches('[data-route]')) {
                bindActiveState(el);
              }
              // Check descendants
              if (el.querySelectorAll) {
                el.querySelectorAll('[data-route]').forEach((child) => bindActiveState(child as HTMLElement));
              }
            }
          });
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => observer.disconnect());
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
    boundLinks.clear();
  };

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
