import type { ReadonlyAtom } from '@but212/atom-effect';
import { computed, atom as createAtom, effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES, ROUTE_DEFAULTS } from '@/constants';
import { registry } from '@/core/registry';
import type { RouteConfig, Router, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

// --- Helper: Safe History API Wrappers ---

/**
 * Safely executes history.pushState with a fallback for restricted environments.
 * Prevents crashes in 'file://' protocol or security-restricted contexts.
 *
 * @param data State data to associate with the new history entry
 * @param url The new URL to display in the address bar
 */
function safePushState(data: unknown, url: string | URL | null): void {
  try {
    history.pushState(data, '', url);
  } catch (e) {
    debug.warn(
      LOG_PREFIXES.ROUTE,
      'PushState failed (likely file:// protocol or security restriction). UI will update, but URL will not.',
      e
    );
  }
}

/**
 * Solid Implementation of the SPA Router.
 * Supports both standard History API and Hash-based routing.
 * Integrates with atom-effect for reactive route and query parameter tracking.
 */
class RouterImpl implements Router {
  /** Reactive atom holding the currently active route name */
  public currentRoute: ReadonlyAtom<string>;
  /** Reactive atom holding the current URL query parameters as an object */
  public queryParams: ReadonlyAtom<Record<string, string>>;

  private config: Required<RouteConfig>;
  private readonly isHistoryMode: boolean;
  private readonly basePath: string;
  private readonly activeClass: string;

  private isDestroyed = false;
  private previousRoute = '';
  private previousUrl: string;
  /** Global cleanup functions for the router instance */
  private cleanups: Array<() => void> = [];
  /** The root element where routes are rendered */
  private $target: JQuery;
  private currentRouteAtom: WritableAtom<string>;
  private queryParamsAtom: WritableAtom<Record<string, string>>;
  /** Cache for HTMLTemplateElements to avoid repeated DOM lookups */
  private templateCache = new Map<string, HTMLTemplateElement>();
  /** Cleanup functions specific to the currently rendered route (disposed on route change) */
  private routeCleanups: Array<() => void> = [];
  /** Tracker for query string changes to prevent redundant updates */
  private lastRawQuery = '';
  private cachedParams: Record<string, string> = {};

  /**
   * Parses a raw query string into a key-value object.
   */
  private parseQueryParams(raw: string): Record<string, string> {
    const res: Record<string, string> = {};
    if (raw) {
      new URLSearchParams(raw).forEach((v, k) => {
        res[k] = v;
      });
    }
    return res;
  }

  constructor(config: RouteConfig) {
    // Fill in defaults for missing configuration options
    this.config = {
      mode: ROUTE_DEFAULTS.mode,
      basePath: ROUTE_DEFAULTS.basePath,
      autoBindLinks: ROUTE_DEFAULTS.autoBindLinks,
      activeClass: ROUTE_DEFAULTS.activeClass,
      notFound: config.notFound || '',
      beforeTransition: config.beforeTransition || (() => {}),
      afterTransition: config.afterTransition || (() => {}),
      ...config,
    } as Required<RouteConfig>;

    this.isHistoryMode = this.config.mode === 'history';
    // Normalize base path by removing trailing slash
    this.basePath = this.config.basePath.replace(/\/$/, '');
    this.activeClass = this.config.activeClass;

    this.$target = $(this.config.target);
    // Initialize previous URL stack based on mode
    this.previousUrl = this.isHistoryMode ? location.pathname + location.search : location.hash;

    // Initialize reactive atoms with current browser state
    this.currentRouteAtom = createAtom(this.getRouteName());
    this.currentRoute = this.currentRouteAtom;
    this.queryParamsAtom = createAtom(this.getQueryParams());
    this.queryParams = computed(() => this.queryParamsAtom.value);

    this.init();
  }

  /**
   * Sets up event listeners and core reactive effects.
   */
  private init() {
    // Listen for browser navigation (back/forward)
    const event = this.isHistoryMode ? 'popstate' : 'hashchange';
    const handler = this.handleUrlChange.bind(this);
    window.addEventListener(event, handler);
    this.cleanups.push(() => window.removeEventListener(event, handler));

    // Reactive effect that handles DOM rendering when the current route atom changes
    const renderEffect = effect(() => {
      const routeName = this.currentRouteAtom.value;

      // Dispose old route-specific effects before rendering the new one
      untracked(() => {
        for (const fn of this.routeCleanups) {
          try {
            fn();
          } catch {}
        }
        this.routeCleanups.length = 0;
      });

      this.renderRoute(routeName);
    });
    this.cleanups.push(() => renderEffect.dispose());

    // Setup automatic link binding for [data-route] elements
    this.setupAutoBindLinks();

    // Register with global registry if target exists for auto-destruction
    if (this.$target[0]) {
      registry.trackCleanup(this.$target[0], () => this.destroy());
    }
  }

  /**
   * Determines the current route name from the URL based on the routing mode.
   */
  private getRouteName(): string {
    const { default: defaultRoute } = this.config;
    if (this.isHistoryMode) {
      const base = this.basePath;
      let path = location.pathname;
      // Strip base path from the URL to get the logical route
      if (base && (path === base || path.startsWith(`${base}/`))) {
        path = path.substring(base.length);
      }
      return path.replace(/^\/+/, '') || defaultRoute!;
    }
    const hash = location.hash;
    const { route } = this.splitPath(hash.startsWith('#') ? hash.substring(1) : hash);
    return route || defaultRoute!;
  }

  /**
   * Extracts and parses query parameters from the browser URL.
   * Includes primitive caching to skip redundant parsing.
   */
  private getQueryParams(): Record<string, string> {
    const raw = this.getCurrentRawQuery();
    // Optimization: Skip parsing if the raw query string hasn't changed
    if (raw === this.lastRawQuery) return this.cachedParams;
    this.lastRawQuery = raw;

    const res = this.parseQueryParams(raw);
    // Deep equality check to prevent downstream reactive triggers if values are identical
    if (this.areParamsEqual(res, this.cachedParams)) return this.cachedParams;

    // Validate URI encoding to catch malformed query components
    if (raw.indexOf('%') !== -1) {
      try {
        decodeURIComponent(raw);
      } catch {
        debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.MALFORMED_URI(raw));
      }
    }

    this.cachedParams = res;
    return res;
  }

  /**
   * Helper to get the raw query string regardless of routing mode.
   */
  private getCurrentRawQuery(): string {
    if (this.isHistoryMode) return location.search.substring(1);
    const hash = location.hash;
    const queryIndex = hash.indexOf('?');
    return queryIndex !== -1 ? hash.substring(queryIndex + 1) : '';
  }

  /**
   * Performs shallow comparison of two query parameter objects.
   */
  private areParamsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    for (const k of keysA) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  }

  /**
   * Splits a path string into route and query components.
   * @param path Full string to split (e.g., "products/list?sort=asc")
   */
  private splitPath(path: string): { route: string; query: string | undefined } {
    const queryIndex = path.indexOf('?');
    const route = queryIndex !== -1 ? path.slice(0, queryIndex) : path;
    const query = queryIndex !== -1 ? path.slice(queryIndex + 1) : undefined;
    return {
      route: route.replace(/^\/+/, ''),
      query,
    };
  }

  /**
   * Updates the browser URL to match the given route name.
   * @param name Internal route path (e.g., "login")
   */
  private setUrl(name: string): void {
    const { route, query } = this.splitPath(name);
    const fullPath = query ? `${route}?${query}` : route;
    const url = this.isHistoryMode ? `${this.basePath}/${fullPath}` : `#${fullPath}`;

    if (this.isHistoryMode) {
      safePushState(null, url);
    } else {
      location.hash = url;
    }
    this.previousUrl = this.isHistoryMode ? url : location.hash;
  }

  /**
   * Reverts the browser URL to the last known successful state (used for navigation guards).
   */
  private restoreUrl(): void {
    try {
      if (this.isHistoryMode) {
        history.replaceState(null, '', this.previousUrl);
      } else {
        location.hash = this.previousUrl;
      }
    } catch (e) {
      debug.warn(LOG_PREFIXES.ROUTE, 'Restore URL failed', e);
    }
  }

  /**
   * Renders the UI content associated with a route name.
   * Handles lifecycle hooks (beforeTransition, onEnter, onMount, afterTransition).
   * Supports both function-based rendering and HTML template cloning.
   *
   * @param name The route name to render
   */
  private renderRoute(name: string): void {
    if (this.isDestroyed || !this.$target[0]) return;

    const { routes, notFound, beforeTransition, afterTransition } = this.config;
    // Fallback to 'notFound' route if the requested route doesn't exist
    const cfg = routes[name] ?? (notFound ? routes[notFound] : undefined);

    if (!cfg) {
      debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.NOT_FOUND(name));
      return;
    }

    const params = this.getQueryParams();
    const from = this.previousRoute;

    // Trigger global hook before transition starts
    if (beforeTransition) untracked(() => beforeTransition(from, name));

    // Flush current view
    this.$target.empty();

    let routeParams = params;
    // Process route-level enter guard and parameter resolution
    if (cfg.onEnter) {
      const res = untracked(() => cfg.onEnter!(params, this));
      if (res) routeParams = { ...params, ...res };
    }

    // Helper to register per-route cleanup logic (e.g., event listeners or timers)
    const onUnmount = (fn: () => void) => this.routeCleanups.push(fn);

    if (cfg.render) {
      // Logic defined in code (custom composition)
      cfg.render(this.$target[0], name, routeParams, onUnmount, this);
    } else if (cfg.template) {
      // Logic defined in HTML <template> tags
      let tmpl = this.templateCache.get(cfg.template);
      if (!tmpl) {
        const el = document.querySelector(cfg.template);
        if (el instanceof HTMLTemplateElement) {
          tmpl = el;
          this.templateCache.set(cfg.template, tmpl);
        } else {
          debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.TEMPLATE_NOT_FOUND(cfg.template));
          return;
        }
      }
      this.$target.append(tmpl.content.cloneNode(true) as DocumentFragment);
      // Run optional mount hook for template-based views
      if (cfg.onMount) {
        cfg.onMount(this.$target.children(), onUnmount, this);
      }
    }

    // Trigger global hook after successful transition
    if (afterTransition) untracked(() => afterTransition(from, name));
    this.previousRoute = name;
  }

  /**
   * Internal listener for URL changes (back/forward or external hash modification).
   * Executes the onLeave guard before proceeding with navigation.
   */
  private handleUrlChange(): void {
    if (this.isDestroyed) return;

    const currentUrl = this.isHistoryMode ? location.pathname + location.search : location.hash;
    // If the URL actually hasn't changed, do nothing
    if (currentUrl === this.previousUrl) return;

    const nextRoute = this.getRouteName();
    const oldRoute = this.currentRouteAtom.peek();

    if (oldRoute !== nextRoute) {
      // Execute the 'onLeave' guard for the current route
      if (untracked(() => this.config.routes[oldRoute]?.onLeave?.(this)) === false) {
        // If the guard returns false, cancel navigation and revert the URL
        this.restoreUrl();
        return;
      }
      this.currentRouteAtom.value = nextRoute;
    }

    // Always update query params to match the new URL
    this.queryParamsAtom.value = this.getQueryParams();
    this.previousUrl = currentUrl;
  }

  /**
   * Sets up automatic delegation for all links marked with [data-route].
   * Also initializes a reactive link highlighter for "active" states.
   */
  private setupAutoBindLinks(): void {
    if (!this.config.autoBindLinks) return;

    // Handle clicks on [data-route] elements globally via delegation
    const onClick = (e: JQuery.TriggeredEvent) => {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).dataset.route;
      if (r != null) this.navigate(r);
    };
    $(document).on('click', '[data-route]', onClick);
    this.cleanups.push(() => $(document).off('click', '[data-route]', onClick));

    // Reactive effect to toggle active classes and ARIA attributes on relevant links
    let previousActiveNodes: HTMLElement[] = [];
    const activeLinkEffect = effect(() => {
      const routeName = this.currentRouteAtom.value;
      const activeClass = this.activeClass;

      untracked(() => {
        // Clear previous state to ensure only the currently active route is highlighted
        for (const el of previousActiveNodes) {
          el.classList.remove(activeClass);
          el.removeAttribute('aria-current');
        }

        try {
          const selector = `[data-route="${routeName.replace(/"/g, '\\"')}"]`;
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
          for (const el of nodes) {
            el.classList.add(activeClass);
            el.setAttribute('aria-current', 'page');
          }
          previousActiveNodes = nodes;
        } catch {
          previousActiveNodes = [];
        }
      });
    });

    this.cleanups.push(() => {
      activeLinkEffect.dispose();
      previousActiveNodes.length = 0;
    });
  }

  /**
   * Programmatically navigate to a specified route.
   * Checks the 'onLeave' guard before performing the transition.
   *
   * @param name Route path or full URL (e.g., "products/1" or "info?tab=desc")
   */
  public navigate(name: string): void {
    if (this.isDestroyed) return;

    const old = this.currentRouteAtom.peek();
    // Run exit guard for current route
    if (this.config.routes[old]?.onLeave?.(this) === false) return;

    const { route: routePart, query: queryPart } = this.splitPath(name);
    const resolvedRoute = routePart || this.config.default || '';
    if (!resolvedRoute) return;

    // Batch atom updates to prevent flickering or multiple partial renders
    $.batch(() => {
      this.setUrl(name);

      const nextParams = queryPart ? this.parseQueryParams(queryPart) : {};
      if (!this.areParamsEqual(nextParams, this.queryParamsAtom.peek())) {
        this.queryParamsAtom.value = nextParams;
      }
      this.currentRouteAtom.value = resolvedRoute;
    });
  }

  /**
   * Shuts down the router, clearing all event listeners, effects, and caches.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    for (const fn of this.cleanups) {
      try {
        fn();
      } catch {}
    }
    this.cleanups.length = 0;
    this.templateCache.clear();
  }
}

/**
 * Factory function to create a new SPA router instance with reactive state management.
 *
 * @param config Configuration for the internal routing engine and route mapping.
 * @returns A Router instance for controlling navigation and tracking state.
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

// Extend jQuery static namespace for easy global access
$.extend({
  route,
});
