import type { ReadonlyAtom } from '@but212/atom-effect';
import { computed, atom as createAtom, effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES, ROUTE_DEFAULTS } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from './types';

// --- Helper: Safe History API Wrappers ---
function safePushState(data: unknown, url: string | URL | null): boolean {
  try {
    // Second argument (title) is deprecated in the spec and ignored by all
    // browsers — pass an empty string as required by the signature.
    history.pushState(data, '', url);
    return true;
  } catch (e) {
    debug.warn(
      LOG_PREFIXES.ROUTE,
      'PushState failed (likely file:// protocol or security restriction). UI will update, but URL will not.',
      e
    );
    return false;
  }
}

class RouterImpl implements Router {
  /**
   * Reactive atom containing the current route name.
   * Exposed as ReadonlyAtom so external code cannot mutate route state
   * without going through navigate(), which keeps URL and atom in sync.
   */
  public currentRoute: ReadonlyAtom<string>;
  public queryParams: ReadonlyAtom<Record<string, string>>;

  private config: RouteConfig;
  private isDestroyed = false;
  /**
   * Tracks the route name of the last completed transition.
   * Initialized to empty string so beforeTransition/afterTransition always
   * receive a consistent `from` value — never `from === to` on the first render.
   */
  private previousRoute = '';
  /**
   * Mirrors the browser URL after every committed navigation.
   * Used by handleUrlChange to detect real URL changes (vs. our own
   * programmatic updates) and by restoreUrl to roll back blocked transitions.
   */
  private previousUrl: string;
  private cleanups: Array<() => void> = [];

  private $target: JQuery;
  private isHistoryMode: boolean;
  private currentRouteAtom: WritableAtom<string>;
  private queryParamsAtom: WritableAtom<Record<string, string>>;
  /** Caches resolved HTMLTemplateElement references to avoid repeated querySelector calls. */
  private templateCache = new Map<string, HTMLTemplateElement>();
  /** Pre-calculated base path with trailing slash stripped for consistent URL building. */
  private normalizedBasePath: string;
  /**
   * Resolved CSS class for active links. Never `undefined` at runtime as it's
   * always filled from `ROUTE_DEFAULTS.activeClass` in the constructor.
   */
  private activeClass: string;

  constructor(config: RouteConfig) {
    // Destructure configuration with defaults for internal use
    this.config = {
      ...config,
      mode: config.mode ?? ROUTE_DEFAULTS.mode,
      basePath: config.basePath ?? ROUTE_DEFAULTS.basePath,
      autoBindLinks: config.autoBindLinks ?? ROUTE_DEFAULTS.autoBindLinks,
      activeClass: config.activeClass ?? ROUTE_DEFAULTS.activeClass,
    };

    this.isHistoryMode = this.config.mode === 'history';
    this.$target = $(this.config.target);
    // Strip trailing slash so URL construction is always `${base}/${route}`.
    this.normalizedBasePath = this.config.basePath?.replace(/\/$/, '') || '';
    this.activeClass = this.config.activeClass ?? ROUTE_DEFAULTS.activeClass;

    // Initialize previousUrl based on current state before setting up atoms.
    // getCurrentUrl() cannot be called yet (method depends on isHistoryMode which is set above).
    this.previousUrl = this.isHistoryMode
      ? window.location.pathname + window.location.search
      : window.location.hash;

    // Initialize state atoms; expose via ReadonlyAtom to prevent external mutation.
    this.currentRouteAtom = createAtom(this.getRouteName());
    this.currentRoute = this.currentRouteAtom;
    this.queryParamsAtom = createAtom(this.getQueryParams());
    // Use computed() to ensure queryParams is truly read-only at runtime,
    // as verified by the 'should be read-only (computed)' test.
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

    // Set up reactive rendering effect.
    // Only currentRouteAtom.value is the intended reactive dependency.
    // renderRoute calls user lifecycle hooks (beforeTransition, onEnter, render,
    // onMount, afterTransition) that may read atoms — those reads must not
    // subscribe this effect to extra dependencies.
    const renderEffect = effect(() => {
      const routeName = this.currentRouteAtom.value; // sole tracked dependency
      untracked(() => this.renderRoute(routeName)); // user hooks run untracked
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
   * Uses `normalizedBasePath` for consistent stripping in history mode.
   */
  private getRouteName(): string {
    const { default: defaultRoute } = this.config;

    if (this.isHistoryMode) {
      let pathname = window.location.pathname;
      // Strip the pre-normalized base path prefix.
      if (this.normalizedBasePath && pathname.startsWith(this.normalizedBasePath)) {
        pathname = pathname.substring(this.normalizedBasePath.length);
      }
      // Remove leading slash (optimized: charCodeAt avoids substring allocation)
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
   *
   * Note: duplicate keys (e.g. `?a=1&a=2`) are collapsed to the last value
   * only (`{ a: '2' }`). This matches `URLSearchParams` → `Object.fromEntries`
   * behaviour. If multi-value keys are needed, access `queryParams` via
   * `new URLSearchParams(window.location.search).getAll('key')` directly.
   *
   * Malformed percent-encoding (e.g. `%FF%FE`) is handled silently by
   * `URLSearchParams` — it replaces undecodable sequences with the replacement
   * character (U+FFFD) and continues parsing. If malformed encoding is detected,
   * a warning is emitted via `debug.warn`, but the best-effort parsed result
   * is still returned.
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
        debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.MALFORMED_URI(raw));
      }
    }

    return params;
  }

  /**
   * Updates the browser URL to reflect a new route and keeps `previousUrl`
   * in sync so `handleUrlChange` does not re-process our own navigation.
   */
  private setUrl(routeName: string): void {
    if (this.isHistoryMode) {
      const url = `${this.normalizedBasePath}/${routeName}`;
      safePushState(null, url);
      this.previousUrl = url;
    } else {
      const hash = `#${routeName}`;
      window.location.hash = hash;
      this.previousUrl = hash;
    }
  }

  /**
   * Restores the URL when a navigation guard blocks the transition.
   * Uses pushState to safely add a new history entry, avoiding "back button traps"
   * that occur with replaceState during popstate events.
   */
  private restoreUrl(): void {
    if (this.isHistoryMode) {
      safePushState(null, this.previousUrl);
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
      debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.NOT_FOUND(routeName));
      return null;
    }

    return routeConfig;
  }

  /**
   * Appends cloned template content into the target container.
   * Always appends — callers are responsible for calling `$target.empty()`
   * before invoking this method if a clean slate is needed.
   */
  private renderTemplate(templateSelector: string): boolean {
    let template = this.templateCache.get(templateSelector);

    if (!template) {
      const el = document.querySelector(templateSelector);
      if (!el || !(el instanceof HTMLTemplateElement)) {
        debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.TEMPLATE_NOT_FOUND(templateSelector));
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
   *
   * Called from within a reactive effect, so DOM mutations here run
   * synchronously inside the effect body. `registry.cleanupDescendants` is
   * called before `$target.empty()` to ensure any reactive bindings on
   * outgoing content are disposed before the nodes are removed — preventing
   * the MutationObserver auto-cleanup path from firing a redundant cleanup.
   *
   * EXCEPTION BEHAVIOUR:
   * - `beforeTransition` throws → render aborted, outgoing DOM intact,
   *   `previousRoute` unchanged. Intentional: a throwing hook signals that
   *   the transition should not proceed.
   * - `onEnter` throws → container is already empty (`$target.empty()` ran),
   *   rendering is skipped, and `previousRoute` is NOT updated. The router
   *   is left in an empty-container / stale-previousRoute state. This behavior
   *   is by design to prevent unintended state changes if the `onEnter` hook fails.
   *   If recovery is needed, the hook should catch its own errors internally.
   */
  private renderRoute(routeName: string): void {
    if (this.isDestroyed) return;

    // Validate target element exists
    const container = this.$target[0];
    if (!container) {
      debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.TARGET_NOT_FOUND(this.config.target));
      return;
    }

    // Resolve route configuration
    const routeConfig = this.getRouteConfig(routeName);
    if (!routeConfig) return;

    // Parse query parameters
    const params = this.getQueryParams();

    // `previousRoute` is '' on first render, so from !== to in all cases.
    const fromRoute = this.previousRoute;

    // Call beforeTransition hook.
    // If it throws, the render is aborted — outgoing content stays in the DOM.
    if (this.config.beforeTransition) {
      this.config.beforeTransition(fromRoute, routeName);
    }

    // Dispose reactive bindings on outgoing content before clearing the DOM.
    // $.fn.empty() (patched via jquery-patch) handles cleanupDescendants automatically.
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
      this.config.afterTransition(fromRoute, routeName);
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
    // Early-exit if URL didn't actually change (e.g., called by our own navigate()).
    if (currentUrl === this.previousUrl) return;

    const newRoute = this.getRouteName();
    // peek(): event handler path — reading for comparison only, not to subscribe.
    const oldRouteName = this.currentRouteAtom.peek();
    const params = this.getQueryParams();

    if (oldRouteName !== newRoute) {
      // Check onLeave guard for user-driven navigation
      const oldRouteConfig = this.config.routes[oldRouteName];
      if (oldRouteConfig?.onLeave) {
        if (oldRouteConfig.onLeave() === false) {
          // Navigation blocked — restore the URL without updating previousUrl,
          // so the next real navigation is still detected correctly.
          this.restoreUrl();
          return;
        }
      }
      // Two separate writes — the scheduler's automatic microtask batching
      // guarantees they are flushed together in the next microtask tick,
      // so subscribers always see a consistent snapshot of the (route, params) pair.
      // renderRoute reads getQueryParams() directly from the URL, so there
      // is no double-write risk from the queryParamsAtom update.
      this.currentRouteAtom.value = newRoute;
      this.queryParamsAtom.value = params;
    } else {
      // Same route but URL changed (e.g., query params only)
      this.queryParamsAtom.value = params;
      const routeConfig = this.config.routes[oldRouteName];
      if (routeConfig?.onParamsChange) {
        routeConfig.onParamsChange(params);
      } else {
        this.renderRoute(newRoute);
      }
    }

    // Commit the new URL only after a successful (unblocked) transition.
    this.previousUrl = currentUrl;
  }

  /**
   * Sets up automatic binding for navigation links with data-route attribute.
   *
   * Event delegation is attached to `document` (not `$target`) so that
   * `[data-route]` links anywhere in the page — including outside the router's
   * target container — can trigger navigation. This is intentional: nav links
   * typically live in headers or sidebars, not inside the routed content area.
   *
   * Active-link management uses a reactive effect that re-runs only when
   * `currentRoute` changes — more efficient than a persistent MutationObserver.
   */
  private setupAutoBindLinks(): void {
    if (!this.config.autoBindLinks) return;

    // 1. Event delegation on document so nav links outside $target are handled.
    const delegateHandler = (e: JQuery.TriggeredEvent) => {
      e.preventDefault();
      const routeAttr = (e.currentTarget as HTMLElement).dataset.route;
      if (routeAttr != null) this.navigate(routeAttr);
    };

    $(document).on('click', '[data-route]', delegateHandler);
    this.cleanups.push(() => {
      $(document).off('click', '[data-route]', delegateHandler);
    });

    // 2. Active state management — re-runs only when currentRoute changes.
    const activeClass = this.activeClass;

    const activeLinksEffect = effect(() => {
      const current = this.currentRouteAtom.value; // sole tracked dependency
      // DOM queries and class manipulations run untracked: they must not
      // subscribe the effect to anything beyond currentRouteAtom.
      untracked(() => {
        const links = document.querySelectorAll<HTMLElement>('[data-route]');

        for (let i = 0, len = links.length; i < len; i++) {
          const el = links[i]!;
          const routeAttr = el.dataset.route!;
          const isActive = current === routeAttr;

          el.classList.toggle(activeClass, isActive);
          if (isActive) {
            el.setAttribute('aria-current', 'page');
          } else {
            el.removeAttribute('aria-current');
          }
        }
      });
    });

    this.cleanups.push(() => activeLinksEffect.dispose());
  }

  /**
   * Navigates to the specified route programmatically.
   *
   * If `routeName` resolves to an empty string after falling back to
   * `config.default`, `setUrl` will be called with an empty string, producing
   * a URL of `${basePath}/` in history mode. Callers should ensure
   * `config.default` is always a non-empty route name.
   */
  public navigate(routeName: string): void {
    if (this.isDestroyed) return;

    // peek(): navigate() is called imperatively (not inside an effect), so
    // reading the current route must not register a reactive dependency.
    const currentRouteName = this.currentRouteAtom.peek();
    const currentRouteConfig = this.config.routes[currentRouteName];

    if (currentRouteConfig?.onLeave) {
      const canLeave = currentRouteConfig.onLeave();
      if (canLeave === false) return; // Navigation blocked
    }

    // Resolve empty route name to default route, matching getRouteName behavior
    const resolved = routeName || this.config.default;
    if (!resolved) {
      debug.warn(
        LOG_PREFIXES.ROUTE,
        'navigate() called with empty routeName and no default configured.'
      );
      return;
    }

    // setUrl() updates the browser URL AND sets this.previousUrl so that
    // the resulting hashchange/popstate event (which fires synchronously on
    // some browsers for hash-mode) is ignored by handleUrlChange.
    // This is intentionally different from handleUrlChange, where previousUrl
    // is committed at the END after a successful unblocked transition.
    this.setUrl(resolved);
    // Two separate writes — the scheduler's automatic microtask batching
    // guarantees they are flushed together in the next microtask tick,
    // so subscribers always see a consistent snapshot of the (route, params) pair.
    this.queryParamsAtom.value = {};
    this.currentRouteAtom.value = resolved;
  }

  /**
   * Cleans up all event listeners and effects, and releases the template cache.
   * Each cleanup function is called in a try/catch so that a single failing
   * cleanup does not prevent the remaining ones from running.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Swap before iterating: if a cleanup function somehow pushes to
    // this.cleanups (e.g. a misbehaving plugin), those additions are not
    // iterated and do not cause an infinite loop or missed teardown.
    const cleanups = this.cleanups;
    this.cleanups = [];

    for (let i = 0, len = cleanups.length; i < len; i++) {
      try {
        cleanups[i]!();
      } catch (e) {
        debug.warn(LOG_PREFIXES.ROUTE, 'Cleanup error during destroy:', e);
      }
    }

    // Release cached template references to allow GC.
    this.templateCache.clear();
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
 * `$.extend(obj)` merges into JQueryStatic; use `$.fn.extend(obj)` for instance methods.
 */
$.extend({
  route,
});
