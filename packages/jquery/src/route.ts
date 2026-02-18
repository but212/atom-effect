import { atom as createAtom, computed, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { LOG_PREFIXES, ROUTE_DEFAULTS } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from './types';

/**
 * Log prefix for router warnings and errors.
 */
const LOG_PREFIX = LOG_PREFIXES.ROUTE;

/**
 * Creates an SPA router with reactive state management.
 * Supports both hash-based and pushState-based (history) routing.
 *
 * This removes boilerplate from manual route handling by:
 * - Automatically tracking URL changes and updating the UI
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
 * */
export function route(config: RouteConfig): Router {
  // Destructure configuration with defaults
  const {
    target,
    default: defaultRoute,
    routes,
    notFound,
    mode = ROUTE_DEFAULTS.MODE,
    basePath = ROUTE_DEFAULTS.BASE_PATH,
    autoBindLinks = ROUTE_DEFAULTS.AUTO_BIND_LINKS,
    activeClass = ROUTE_DEFAULTS.ACTIVE_CLASS,
    beforeTransition,
    afterTransition,
  } = config;

  const isHistoryMode = mode === 'history';

  let isDestroyed = false;
  let previousRoute: string | null = null;
  let previousUrl: string = isHistoryMode
    ? window.location.pathname + window.location.search
    : window.location.hash;
  const cleanups: Array<() => void> = [];
  const boundLinks = new Set<HTMLElement>(); // Track links for cleanup via registry

  // DOM references
  const $target = $(target);

  // --- Mode-abstracted internal functions ---

  /**
   * Extracts route name from current URL.
   * Hash mode: parses window.location.hash
   * History mode: extracts from pathname after basePath
   */
  const getRouteName = (): string => {
    if (isHistoryMode) {
      let pathname = window.location.pathname;
      // Remove basePath prefix
      if (basePath && pathname.startsWith(basePath)) {
        pathname = pathname.substring(basePath.length);
      }
      // Remove leading slash and extract route name (before any query)
      const routeName = pathname.replace(/^\//, '');
      return routeName || defaultRoute;
    }
    // Hash mode
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    const routeName = qIndex === -1 ? hash.substring(1) : hash.substring(1, qIndex);
    return routeName || defaultRoute;
  };

  /**
   * Parses query parameters from the current URL.
   * Hash mode: parses from hash string (after ?)
   * History mode: parses from window.location.search
   */
  const getQueryParams = (): Record<string, string> => {
    let raw: string;

    if (isHistoryMode) {
      raw = window.location.search.substring(1); // Remove leading '?'
      if (!raw) return {};
    } else {
      const hash = window.location.hash;
      const qIndex = hash.indexOf('?');
      if (qIndex === -1) return {};
      raw = hash.substring(qIndex + 1);
    }

    const sp = new URLSearchParams(raw);
    const params: Record<string, string> = Object.fromEntries(sp);

    // Warn about malformed percent-encoded sequences (e.g. %FF%FE)
    if (raw.includes('%')) {
      try {
        decodeURIComponent(raw);
      } catch (_e) {
        debug.warn(`${LOG_PREFIX} Malformed URI component: ${raw}`);
      }
    }

    return params;
  };

  // --- Helper: Safe History API Wrappers ---
  const safePushState = (data: unknown, unused: string, url: string | URL | null) => {
    try {
      history.pushState(data, unused, url);
      return true;
    } catch (e) {
      debug.warn(
        `${LOG_PREFIX} PushState failed (likely file:// protocol or security restriction). UI will update, but URL will not.`,
        e
      );
      return false;
    }
  };

  const safeReplaceState = (data: unknown, unused: string, url: string | URL | null) => {
    try {
      history.replaceState(data, unused, url);
      return true;
    } catch (e) {
      debug.warn(`${LOG_PREFIX} ReplaceState failed.`, e);
      return false;
    }
  };

  /**
   * Updates the URL to reflect a new route.
   */
  const setUrl = (routeName: string): void => {
    if (isHistoryMode) {
      // Remove trailing slash from basePath if present
      const url = `${basePath.replace(/\/$/, '')}/${routeName}`;
      safePushState(null, '', url);
      // Always update previousUrl so internal state remains consistent
      previousUrl = url;
    } else {
      const hash = `#${routeName}`;
      previousUrl = hash;
      window.location.hash = hash;
    }
  };

  /**
   * Restores the URL when a navigation guard blocks the transition.
   */
  const restoreUrl = (): void => {
    if (isHistoryMode) {
      safeReplaceState(null, '', previousUrl);
    } else {
      window.location.hash = previousUrl;
    }
  };

  /**
   * Returns the current full URL string for comparison purposes.
   */
  const getCurrentUrl = (): string => {
    if (isHistoryMode) {
      return window.location.pathname + window.location.search;
    }
    return window.location.hash;
  };

  // --- End mode-abstracted functions ---

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
      debug.warn(`${LOG_PREFIX} Route "${routeName}" not found and no notFound route configured`);
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
      debug.warn(`${LOG_PREFIX} Template "${templateSelector}" not found`);
      return false;
    }

    const clonedContent = template.content.cloneNode(true) as DocumentFragment;
    $target.append(clonedContent);

    return true;
  };

  const currentRoute: WritableAtom<string> = createAtom(getRouteName());
  const queryParamsAtom: WritableAtom<Record<string, string>> = createAtom(getQueryParams());

  /**
   * Renders the specified route, including lifecycle hooks and content.
   * This is the main rendering function that orchestrates the entire render cycle.
   */
  const renderRoute = (routeName: string): void => {
    if (isDestroyed) return;

    // Validate target element exists
    const container = $target[0];
    if (!container) {
      debug.warn(`${LOG_PREFIX} Target element "${target}" not found`);
      return;
    }

    // Resolve route configuration
    const routeConfig = getRouteConfig(routeName);
    if (!routeConfig) return;

    // Parse query parameters
    const params = getQueryParams();

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
      if (renderTemplate(routeConfig.template)) {
        if (routeConfig.onMount) {
          routeConfig.onMount($target.children());
        }
      }
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

    // Resolve empty route name to default route, matching getRouteName behavior
    const resolved = routeName || defaultRoute;
    setUrl(resolved);
    currentRoute.value = resolved;
  };

  /**
   * Handles browser URL change events (hashchange or popstate).
   */
  const handleUrlChange = (): void => {
    if (isDestroyed) return;

    const currentUrl = getCurrentUrl();
    if (currentUrl === previousUrl) return; // No actual change, or already handled by navigate()

    const newRoute = getRouteName();
    const oldRouteName = currentRoute.value;
    const params = getQueryParams();

    if (oldRouteName !== newRoute) {
      // Check onLeave guard for user-driven navigation
      const oldRouteConfig = routes[oldRouteName];
      if (oldRouteConfig?.onLeave) {
        if (oldRouteConfig.onLeave() === false) {
          // Navigation blocked, revert URL
          restoreUrl();
          return;
        }
      }
      currentRoute.value = newRoute;
      queryParamsAtom.value = params;
    } else {
      // Same route but URL changed (e.g., query params)
      queryParamsAtom.value = params;
      const routeConfig = routes[oldRouteName];
      if (routeConfig?.onParamsChange) {
        routeConfig.onParamsChange(params);
      } else {
        renderRoute(newRoute);
      }
    }

    previousUrl = currentUrl;
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
      const routeAttr = (e.currentTarget as HTMLElement).dataset.route;
      if (routeAttr != null) navigate(routeAttr);
    };

    $(document).on('click', '[data-route]', delegateHandler);

    cleanups.push(() => {
      $(document).off('click', '[data-route]', delegateHandler);
    });

    // 2. Active State Management — single effect for all links
    const trackLink = (el: HTMLElement) => {
      if (boundLinks.has(el)) return;
      boundLinks.add(el);
      el.classList.add('_aes-bound');
    };

    // Initial bind
    for (const el of document.querySelectorAll<HTMLElement>('[data-route]')) {
      trackLink(el);
    }

    const updateActiveStates = (current: string) => {
      for (const el of boundLinks) {
        const routeAttr = el.dataset.route!;
        const isActive = current === routeAttr;
        el.classList.toggle(activeClass, isActive);
        if (isActive) {
          el.setAttribute('aria-current', 'page');
        } else {
          el.removeAttribute('aria-current');
        }
      }
    };

    // Single effect that updates all tracked links
    const activeLinksEffect = effect(() => {
      updateActiveStates(currentRoute.value);
    });
    cleanups.push(() => activeLinksEffect.dispose());

    // Watch for new elements
    const observer = new MutationObserver((mutations) => {
      let added = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const el = node as HTMLElement;
              if (el.matches?.('[data-route]')) {
                trackLink(el);
                added = true;
              }
              if (el.querySelectorAll) {
                el.querySelectorAll('[data-route]').forEach((child) => {
                  trackLink(child as HTMLElement);
                  added = true;
                });
              }
            }
          });
        }
      }
      // Update active states for newly added links
      if (added) {
        updateActiveStates(currentRoute.value);
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

    // Cleanup router-level effects (event listener, render effect)
    cleanups.forEach((cleanup) => cleanup());
    cleanups.length = 0;

    // Cleanup bound links
    boundLinks.forEach((el) => {
      el.classList.remove('_aes-bound');
      registry.cleanup(el);
    });
    boundLinks.clear();
  };

  // Set up URL change listener (hashchange for hash mode, popstate for history mode)
  const eventName = isHistoryMode ? 'popstate' : 'hashchange';
  window.addEventListener(eventName, handleUrlChange);
  cleanups.push(() => window.removeEventListener(eventName, handleUrlChange));

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
    queryParams: computed(() => queryParamsAtom.value),
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
