import { computed, atom as createAtom, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { LOG_PREFIXES, ROUTE_DEFAULTS } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from './types';

/**
 * Log prefix for router warnings and errors.
 */
const LOG_PREFIX = LOG_PREFIXES.ROUTE;

// --- Helper: Safe History API Wrappers ---
function safePushState(data: unknown, unused: string, url: string | URL | null): boolean {
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
}

function safeReplaceState(data: unknown, unused: string, url: string | URL | null): boolean {
  try {
    history.replaceState(data, unused, url);
    return true;
  } catch (e) {
    debug.warn(`${LOG_PREFIX} ReplaceState failed.`, e);
    return false;
  }
}

class RouterImpl implements Router {
  public currentRoute: WritableAtom<string>;
  public queryParams: import('@but212/atom-effect').ReadonlyAtom<Record<string, string>>;

  private config: RouteConfig;
  private isDestroyed = false;
  private previousRoute: string | null = null;
  private previousUrl: string;
  private cleanups: Array<() => void> = [];

  private $target: JQuery;
  private isHistoryMode: boolean;
  private queryParamsAtom: WritableAtom<Record<string, string>>;
  private templateCache = new Map<string, HTMLTemplateElement>(); // Optimization: Cache templates
  private normalizedBasePath: string; // Optimization: Pre-calculated base path

  constructor(config: RouteConfig) {
    // Destructure configuration with defaults for internal use
    this.config = {
      ...config,
      mode: config.mode ?? ROUTE_DEFAULTS.MODE,
      basePath: config.basePath ?? ROUTE_DEFAULTS.BASE_PATH,
      autoBindLinks: config.autoBindLinks ?? ROUTE_DEFAULTS.AUTO_BIND_LINKS,
      activeClass: config.activeClass ?? ROUTE_DEFAULTS.ACTIVE_CLASS,
    };

    this.isHistoryMode = this.config.mode === 'history';
    this.$target = $(this.config.target);
    this.normalizedBasePath = this.config.basePath?.replace(/\/$/, '') || '';

    // Initialize previousUrl based on current state before setting up atoms
    this.previousUrl = this.isHistoryMode
      ? window.location.pathname + window.location.search
      : window.location.hash;

    // Initialize state atoms
    this.currentRoute = createAtom(this.getRouteName());
    this.queryParamsAtom = createAtom(this.getQueryParams());
    this.queryParams = computed(() => this.queryParamsAtom.value);

    // Bind methods that are used as callbacks
    this.handleUrlChange = this.handleUrlChange.bind(this);
    this.destroy = this.destroy.bind(this);

    // Initialize
    this.init();
  }

  private init() {
    // Set up URL change listener
    const eventName = this.isHistoryMode ? 'popstate' : 'hashchange';
    window.addEventListener(eventName, this.handleUrlChange);
    this.cleanups.push(() => window.removeEventListener(eventName, this.handleUrlChange));

    // Set up reactive rendering effect
    const renderEffect = effect(() => {
      this.renderRoute(this.currentRoute.value);
    });
    this.cleanups.push(() => renderEffect.dispose());

    // Auto-bind navigation links
    this.setupAutoBindLinks();

    // Auto-cleanup router if target element is removed
    if (this.$target[0]) {
      registry.trackCleanup(this.$target[0], this.destroy);
    }
  }

  // --- Mode-abstracted internal methods ---

  /**
   * Extracts route name from current URL.
   */
  private getRouteName(): string {
    const { basePath, default: defaultRoute } = this.config;

    if (this.isHistoryMode) {
      let pathname = window.location.pathname;
      // Remove basePath prefix
      if (basePath && pathname.startsWith(basePath)) {
        pathname = pathname.substring(basePath.length);
      }
      // Remove leading slash (optimized)
      if (pathname.charCodeAt(0) === 47) {
        pathname = pathname.slice(1);
      }
      return pathname || defaultRoute;
    }
    // Hash mode
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    const routeName = qIndex === -1 ? hash.substring(1) : hash.substring(1, qIndex);
    return routeName || defaultRoute;
  }

  /**
   * Parses query parameters from the current URL.
   */
  private getQueryParams(): Record<string, string> {
    let raw: string;

    if (this.isHistoryMode) {
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

    // Warn about malformed percent-encoded sequences
    if (raw.includes('%')) {
      try {
        decodeURIComponent(raw);
      } catch (_e) {
        debug.warn(`${LOG_PREFIX} Malformed URI component: ${raw}`);
      }
    }

    return params;
  }

  /**
   * Updates the URL to reflect a new route.
   */
  private setUrl(routeName: string): void {
    if (this.isHistoryMode) {
      // Use pre-calculated base path
      const url = `${this.normalizedBasePath}/${routeName}`;
      safePushState(null, '', url);
      // Always update previousUrl so internal state remains consistent
      this.previousUrl = url;
    } else {
      const hash = `#${routeName}`;
      this.previousUrl = hash;
      window.location.hash = hash;
    }
  }

  /**
   * Restores the URL when a navigation guard blocks the transition.
   */
  /**
   * Restores the URL when a navigation guard blocks the transition.
   * Uses pushState to safely add a new history entry, avoiding "back button traps"
   * that occur with replaceState during popstate events.
   */
  private restoreUrl(): void {
    if (this.isHistoryMode) {
      safePushState(null, '', this.previousUrl);
    } else {
      window.location.hash = this.previousUrl;
    }
  }

  /**
   * Returns the current full URL string for comparison purposes.
   */
  private getCurrentUrl(): string {
    if (this.isHistoryMode) {
      return window.location.pathname + window.location.search;
    }
    return window.location.hash;
  }

  // --- End mode-abstracted methods ---

  /**
   * Resolves route configuration, falling back to notFound route if needed.
   */
  private getRouteConfig(routeName: string): RouteDefinition | null {
    const { routes, notFound } = this.config;
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
  }

  /**
   * Renders template content into target container.
   */
  private renderTemplate(templateSelector: string): boolean {
    let template = this.templateCache.get(templateSelector);

    if (!template) {
      const el = document.querySelector(templateSelector);
      if (!el || !(el instanceof HTMLTemplateElement)) {
        debug.warn(`${LOG_PREFIX} Template "${templateSelector}" not found`);
        return false;
      }
      template = el;
      this.templateCache.set(templateSelector, template);
    }

    const clonedContent = template.content.cloneNode(true) as DocumentFragment;
    this.$target.append(clonedContent);

    return true;
  }

  /**
   * Renders the specified route, including lifecycle hooks and content.
   */
  private renderRoute(routeName: string): void {
    if (this.isDestroyed) return;

    // Validate target element exists
    const container = this.$target[0];
    if (!container) {
      debug.warn(`${LOG_PREFIX} Target element "${this.config.target}" not found`);
      return;
    }

    // Resolve route configuration
    const routeConfig = this.getRouteConfig(routeName);
    if (!routeConfig) return;

    // Parse query parameters
    const params = this.getQueryParams();

    // Call beforeTransition hook
    if (this.config.beforeTransition) {
      this.config.beforeTransition(this.previousRoute || routeName, routeName);
    }

    // Clear current content
    this.$target.empty();

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
      if (this.renderTemplate(routeConfig.template)) {
        if (routeConfig.onMount) {
          routeConfig.onMount(this.$target.children());
        }
      }
    }

    // Call afterTransition hook
    if (this.config.afterTransition) {
      this.config.afterTransition(this.previousRoute || routeName, routeName);
    }

    // Update previous route for next transition
    this.previousRoute = routeName;
  }

  /**
   * Handles browser URL change events (hashchange or popstate).
   */
  private handleUrlChange(): void {
    if (this.isDestroyed) return;

    const currentUrl = this.getCurrentUrl();
    if (currentUrl === this.previousUrl) return; // No actual change, or already handled by navigate()

    const newRoute = this.getRouteName();
    const oldRouteName = this.currentRoute.value;
    const params = this.getQueryParams();

    if (oldRouteName !== newRoute) {
      // Check onLeave guard for user-driven navigation
      const oldRouteConfig = this.config.routes[oldRouteName];
      if (oldRouteConfig?.onLeave) {
        if (oldRouteConfig.onLeave() === false) {
          // Navigation blocked, revert URL
          this.restoreUrl();
          return;
        }
      }
      this.currentRoute.value = newRoute;
      this.queryParamsAtom.value = params;
    } else {
      // Same route but URL changed (e.g., query params)
      this.queryParamsAtom.value = params;
      const routeConfig = this.config.routes[oldRouteName];
      if (routeConfig?.onParamsChange) {
        routeConfig.onParamsChange(params);
      } else {
        this.renderRoute(newRoute);
      }
    }

    this.previousUrl = currentUrl;
  }

  /**
   * Sets up automatic binding for navigation links with data-route attribute.
   * PERFORMANCE: Uses a reactive effect to bulk-update links on route change
   * instead of a persistent MutationObserver, significantly reducing overhead.
   */
  private setupAutoBindLinks(): void {
    if (!this.config.autoBindLinks) return;

    // 1. Event Delegation for Navigation (Efficient: single listener)
    const delegateHandler = (e: JQuery.TriggeredEvent) => {
      e.preventDefault();
      const routeAttr = (e.currentTarget as HTMLElement).dataset.route;
      if (routeAttr != null) this.navigate(routeAttr);
    };

    $(document).on('click', '[data-route]', delegateHandler);
    this.cleanups.push(() => {
      $(document).off('click', '[data-route]', delegateHandler);
    });

    // 2. Active State Management (Efficient: Poll on change)
    const { activeClass } = this.config;
    if (!activeClass) return;

    // Effect re-runs only when currentRoute changes
    const activeLinksEffect = effect(() => {
      const current = this.currentRoute.value;
      // Query specific links only when needed - Data Locality friendly
      const links = document.querySelectorAll<HTMLElement>('[data-route]');

      // Optimization: Cached length loop
      for (let i = 0, len = links.length; i < len; i++) {
        const el = links[i];
        if (!el) continue;

        const routeAttr = el.dataset.route!;
        const isActive = current === routeAttr;

        // Direct DOM manipulation avoiding jQuery overhead for class switching
        if (isActive) {
          el.classList.add(activeClass);
          el.setAttribute('aria-current', 'page');
        } else {
          el.classList.remove(activeClass);
          el.removeAttribute('aria-current');
        }
      }
    });

    this.cleanups.push(() => activeLinksEffect.dispose());
  }

  /**
   * Navigates to the specified route programmatically.
   */
  public navigate(routeName: string): void {
    if (this.isDestroyed) return;

    // Check if leaving current route is allowed
    const currentRouteName = this.currentRoute.value;
    const currentRouteConfig = this.config.routes[currentRouteName];

    if (currentRouteConfig?.onLeave) {
      const canLeave = currentRouteConfig.onLeave();
      if (canLeave === false) return; // Navigation blocked
    }

    // Resolve empty route name to default route, matching getRouteName behavior
    const resolved = routeName || this.config.default;
    this.setUrl(resolved);
    this.currentRoute.value = resolved;
  }

  /**
   * Cleans up all event listeners and effects.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Cleanup router-level effects (event listener, render effect)
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups.length = 0;

    // Cleanup bound links
    // Note: boundLinks set removed for performance. _aes-bound class is harmless effectively.
    // Explicit cleanup of data-route links is no longer tracked to save memory.
  }
}

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
 * ```
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

/**
 * Register as jQuery static method.
 */
$.extend({
  route,
});
