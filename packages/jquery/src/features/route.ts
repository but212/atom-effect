import type { ReadonlyAtom } from '@but212/atom-effect';
import { computed, atom as createAtom, effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES, ROUTE_DEFAULTS } from '@/constants';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

// --- Helper: Safe History API Wrappers ---

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

interface CompiledRoute {
  pattern: string;
  regex: RegExp | null;
  paramNames: string[];
  def: RouteDefinition;
}

/**
 * Router implementation for Single Page Applications (SPA).
 *
 * This router supports:
 * 1. Static and Dynamic routes (regex-based parameter extraction).
 * 2. History (pushState) and Hash navigation modes.
 * 3. Implicit route discovery from DOM templates.
 * 4. Reactive parameter management via atoms.
 * 5. Lifecycle hooks (before/after transition, onEnter, onMount, onLeave).
 */
class RouterImpl implements Router {
  /** Reactive state: The name of the current active route pattern. */
  public currentRoute: ReadonlyAtom<string>;
  /** Reactive state: Current URL query parameters. */
  public queryParams: ReadonlyAtom<Record<string, string>>;
  /** Reactive state: Merged route parameters and query parameters. */
  public params: ReadonlyAtom<Record<string, string>>;

  /** Normalized configuration. */
  private config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  /** O(1) lookup map for static routes without parameters. */
  private exactRoutes = new Map<string, CompiledRoute>();
  /** Array for sequential regex matching for dynamic routes (e.g., /user/:id). */
  private regexRoutes: CompiledRoute[] = [];

  private readonly isHistoryMode: boolean;
  private readonly basePath: string;
  private readonly activeClass: string;

  private isDestroyed = false;
  /** Tracks the pattern name of the previous route for transition hooks. */
  private previousRoute = '';
  /** Tracks the full last URL to support restoration on navigation guard rejection. */
  private previousUrl: string;
  /** Global cleanups for window events and effects. */
  private cleanups: Array<() => void> = [];
  /** Target container for rendering. */
  private $target: JQuery;

  private currentRouteAtom: WritableAtom<string>;
  private queryParamsAtom: WritableAtom<Record<string, string>>;
  private paramsAtom: WritableAtom<Record<string, string>>;

  /** Cache for HTMLTemplateElements to avoid repeated DOM lookups. */
  private templateCache = new Map<string, HTMLTemplateElement>();
  /** Cleanup functions specific to the current route's lifecycle. */
  private routeCleanups: Array<() => void> = [];

  /** Performance optimization: Cache raw query string to avoid re-parsing if unchanged. */
  private lastRawQuery = '';
  private cachedQueryParams: Record<string, string> = {};
  /** Performance optimization: Cache resolved route names for [data-route] links. */
  private linkRouteCache = new WeakMap<HTMLElement, string>();

  /**
   * Parses a query string into a key-value record.
   * Uses URLSearchParams for spec-compliance and simplicity.
   */
  private parseQueryParams(raw: string): Record<string, string> {
    const res: Record<string, string> = {};
    if (!raw) return res;
    new URLSearchParams(raw).forEach((v, k) => {
      res[k] = v;
    });
    return res;
  }

  /**
   * Universal path normalization: removes leading and trailing slashes.
   * This ensures that '/home/', '/home', 'home/', and 'home' are treated identically.
   */
  private normalizePath(path: string): string {
    return path.replace(/(^\/+|\/+$)/g, '');
  }

  constructor(config: RouteConfig) {
    // Merge defaults with user config, ensuring routes and lifecycle hooks represent valid defaults.
    this.config = {
      mode: ROUTE_DEFAULTS.mode,
      basePath: ROUTE_DEFAULTS.basePath,
      autoBindLinks: ROUTE_DEFAULTS.autoBindLinks,
      activeClass: ROUTE_DEFAULTS.activeClass,
      notFound: config.notFound || '',
      beforeTransition: config.beforeTransition || (() => {}),
      afterTransition: config.afterTransition || (() => {}),
      default: config.default || '',
      ...config,
      routes: config.routes || {},
    } as Required<RouteConfig> & { routes: Record<string, RouteDefinition> };

    this.isHistoryMode = this.config.mode === 'history';
    this.basePath = this.config.basePath ? this.config.basePath.replace(/\/$/, '') : '';
    this.activeClass = this.config.activeClass;
    const target = this.config.target;
    if (typeof target === 'string') {
      this.$target = $(target);
    } else if (target instanceof HTMLElement) {
      this.$target = $(target);
    } else {
      this.$target = target as JQuery;
    }
    this.previousUrl = this.isHistoryMode ? location.pathname + location.search : location.hash;

    // Phase 1: Discover routes from DOM templates if 'routes' config is empty.
    this.discoverRoutes();

    // Phase 2: Compile route definitions into static/regex lookups.
    this.compileRoutes();

    // Phase 3: Initialize reactive state.
    const initialRoute = this.getRouteName();
    this.currentRouteAtom = createAtom(initialRoute);
    this.currentRoute = this.currentRouteAtom;

    this.queryParamsAtom = createAtom(this.getQueryParams());
    this.queryParams = computed(() => this.queryParamsAtom.value);

    const initialMatch = this.matchRoute(initialRoute);
    this.paramsAtom = createAtom(initialMatch.params);
    this.params = computed(() => this.paramsAtom.value);

    // Phase 4: Setup event listeners and effects.
    this.init();
  }

  /**
   * Scans the document for <template data-path="..."> elements.
   * This enables zero-config routing by deriving paths directly from the DOM.
   */
  private discoverRoutes() {
    let hasRoutes = false;
    for (const _ in this.config.routes) {
      hasRoutes = true;
      break;
    }
    if (hasRoutes || !this.$target[0]) return;

    try {
      const templates = document.querySelectorAll<HTMLTemplateElement>(`template[data-path]`);
      const len = templates.length;
      const routes = this.config.routes;

      for (let i = 0; i < len; i++) {
        const tmpl = templates[i]!;
        const rawPath = tmpl.getAttribute('data-path');
        if (rawPath == null) continue;

        const path = this.normalizePath(rawPath);
        const isDefault = tmpl.hasAttribute('data-default');

        // Assign a unique ID if missing for selector performance.
        if (!tmpl.id) tmpl.id = `route-tmpl-${Math.random().toString(36).substring(2, 11)}`;
        routes[path] = { template: `#${tmpl.id}` };

        if (isDefault && !this.config.default) {
          this.config.default = path;
        }
      }
    } catch (e) {
      debug.warn(LOG_PREFIXES.ROUTE, 'Route discovery failed:', e);
    }
  }

  /**
   * Pre-compiles route strings into regex patterns for efficient matching.
   * Splits routes into 'exact' (no markers) and 'regex' (with :param) lookups.
   */
  private compileRoutes() {
    this.exactRoutes.clear();
    this.regexRoutes = [];
    const routes = this.config.routes;
    const keys = Object.keys(routes);
    const len = keys.length;

    for (let i = 0; i < len; i++) {
      const rawKey = keys[i]!;
      const key = this.normalizePath(rawKey);
      const def = routes[rawKey]!;

      // Static path optimization
      if (key.indexOf(':') === -1) {
        this.exactRoutes.set(key, { pattern: key, regex: null, paramNames: [], def });
      } else {
        // Dynamic path: convert :name into regex capture groups.
        const paramNames: string[] = [];
        const regexStr = key
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars in static parts
          .replace(/:(\w+)/g, (_, paramName) => {
            paramNames.push(paramName);
            return '([^/]+)';
          });

        this.regexRoutes.push({
          pattern: key,
          regex: new RegExp(`^${regexStr === '' ? '^$' : regexStr}$`),
          paramNames,
          def,
        });
      }
    }
  }

  /**
   * Finds the best matching route for a given path.
   * Prioritizes exact matches before trying dynamic regex patterns.
   */
  private matchRoute(path: string): {
    compiled: CompiledRoute | undefined;
    params: Record<string, string>;
  } {
    const exact = this.exactRoutes.get(path);
    if (exact) return { compiled: exact, params: {} };

    const regexRoutes = this.regexRoutes;
    const len = regexRoutes.length;

    for (let i = 0; i < len; i++) {
      const route = regexRoutes[i]!;
      const match = path.match(route.regex!);
      if (match) {
        const params: Record<string, string> = {};
        const paramNames = route.paramNames;
        const pLen = paramNames.length;
        for (let j = 0; j < pLen; j++) {
          params[paramNames[j]!] = decodeURIComponent(match[j + 1] || '');
        }
        return { compiled: route, params };
      }
    }
    return { compiled: undefined, params: {} };
  }

  /**
   * Sets up history/hash change listeners and reactive rendering effects.
   */
  private init() {
    const event = this.isHistoryMode ? 'popstate' : 'hashchange';
    const handler = this.handleUrlChange.bind(this);
    window.addEventListener(event, handler);
    this.cleanups.push(() => window.removeEventListener(event, handler));

    // Core rendering effect: runs whenever currentRouteAtom changes.
    const renderEffect = effect(() => {
      const routeName = this.currentRouteAtom.value;
      untracked(() => {
        // Execute cleanups from the previous route (if any).
        const routeCleanups = this.routeCleanups;
        const len = routeCleanups.length;
        for (let i = 0; i < len; i++) {
          try {
            routeCleanups[i]!();
          } catch {}
        }
        routeCleanups.length = 0;
      });
      this.renderRoute(routeName);
    });
    this.cleanups.push(() => renderEffect.dispose());

    // Setup global click listener if autoBindLinks is enabled.
    this.setupAutoBindLinks();

    // Automatic destruction when the target container is removed from the DOM.
    const targetEl = this.$target[0];
    if (targetEl) {
      registry.trackCleanup(targetEl, () => this.destroy());
    }
  }

  /**
   * Resolves the current route name from the URL, accounting for basePath and mode.
   */
  private getRouteName(): string {
    const defaultRoute = this.config.default || '';
    if (this.isHistoryMode) {
      const base = this.basePath;
      let path = location.pathname;
      if (base && path.startsWith(base)) {
        if (path.length === base.length || path[base.length] === '/') {
          path = path.substring(base.length);
        }
      }
      return this.normalizePath(path) || defaultRoute;
    }
    const hash = location.hash;
    const path = hash.startsWith('#') ? hash.substring(1) : hash;
    const { route } = this.splitPath(path);
    return route || defaultRoute;
  }

  /**
   * Retrieves and parses current query parameters with caching.
   */
  private getQueryParams(): Record<string, string> {
    const raw = this.getCurrentRawQuery();
    if (raw === this.lastRawQuery) return this.cachedQueryParams;
    this.lastRawQuery = raw;

    const res = this.parseQueryParams(raw);
    if (this.areParamsEqual(res, this.cachedQueryParams)) return this.cachedQueryParams;

    // Check for malformed URI encoding to avoid silent failures.
    if (raw.indexOf('%') !== -1) {
      try {
        decodeURIComponent(raw);
      } catch {
        debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.MALFORMED_URI(raw));
      }
    }
    this.cachedQueryParams = res;
    return res;
  }

  private getCurrentRawQuery(): string {
    if (this.isHistoryMode) return location.search.substring(1);
    const hash = location.hash;
    const queryIndex = hash.indexOf('?');
    return queryIndex !== -1 ? hash.substring(queryIndex + 1) : '';
  }

  /**
   * Shallow equality check for parameter records.
   */
  private areParamsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    if (a === b) return true;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const len = keysA.length;
    if (len !== keysB.length) return false;

    for (let i = 0; i < len; i++) {
      const k = keysA[i]!;
      if (a[k] !== b[k]) return false;
    }
    return true;
  }

  /**
   * Utility to split a URL path into its route and query segments.
   */
  private splitPath(path: string): { route: string; query: string | undefined } {
    const queryIndex = path.indexOf('?');
    if (queryIndex === -1) {
      return { route: this.normalizePath(path), query: undefined };
    }
    return {
      route: this.normalizePath(path.slice(0, queryIndex)),
      query: path.slice(queryIndex + 1),
    };
  }

  /**
   * Actual History/Hash manipulation.
   */
  private setUrl(name: string): void {
    const { route, query } = this.splitPath(name);
    const fullPath = query ? `${route}?${query}` : route;

    if (this.isHistoryMode) {
      const url = `${this.basePath}/${fullPath}`;
      safePushState(null, url);
      this.previousUrl = url;
    } else {
      const url = `#${fullPath}`;
      location.hash = url;
      this.previousUrl = location.hash;
    }
  }

  /**
   * Reverts URL back to the last known valid state.
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
   * Executes the full rendering and transition logic for a requested route.
   */
  private renderRoute(requestedPath: string): void {
    const target = this.$target[0];
    if (this.isDestroyed || !target) return;

    const { compiled, params } = this.matchRoute(requestedPath);
    let cfg = compiled?.def;

    // Fallback if the route is not defined.
    if (!cfg) {
      const notFoundRoute = this.config.notFound;
      cfg = notFoundRoute ? this.config.routes[notFoundRoute] : undefined;
      if (!cfg) {
        debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.NOT_FOUND(requestedPath));
        return;
      }
    }

    const queryParams = this.getQueryParams();
    const from = this.previousRoute;
    const name = compiled ? compiled.pattern : requestedPath;

    const beforeHook = this.config.beforeTransition;
    if (beforeHook) untracked(() => beforeHook(from, name));

    // Clear target container efficiently using native DOM removal.
    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }

    // Merge parameters: Query Params + Path Params.
    let allParams = Object.assign({}, queryParams, params);

    // onEnter hook: allow data fetching or param modification before rendering.
    if (cfg.onEnter) {
      const res = untracked(() => cfg!.onEnter!(allParams, this));
      if (res) allParams = Object.assign(allParams, res);
    }

    // Update the reactive params atom if they have changed.
    if (!this.areParamsEqual(this.paramsAtom.peek(), allParams)) {
      this.paramsAtom.value = allParams;
    }

    const onUnmount = (fn: () => void) => this.routeCleanups.push(fn);

    // Method A: Manual rendering function.
    if (cfg.render) {
      cfg.render(target, name, allParams, onUnmount, this);
    }
    // Method B: Template-based rendering.
    else if (cfg.template) {
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
      // Clone template content once for performance.
      target.appendChild(tmpl.content.cloneNode(true));
      if (cfg.onMount) {
        cfg.onMount($(target).children(), onUnmount, this);
      }
    }

    const afterHook = this.config.afterTransition;
    if (afterHook) untracked(() => afterHook(from, name));
    this.previousRoute = name;
  }

  /**
   * Listener for browser navigation events (back/forward or manual URL change).
   */
  private handleUrlChange(): void {
    if (this.isDestroyed) return;

    const currentUrl = this.isHistoryMode ? location.pathname + location.search : location.hash;
    // Debounce if URLs are identical.
    if (currentUrl === this.previousUrl) return;

    const nextRoute = this.getRouteName();
    const oldRouteAtom = this.currentRouteAtom;
    const oldRoute = oldRouteAtom.peek();

    if (oldRoute !== nextRoute) {
      const { compiled: oldCompiled } = this.matchRoute(oldRoute);
      const oldCfg = oldCompiled
        ? oldCompiled.def
        : this.config.notFound
          ? this.config.routes[this.config.notFound]
          : undefined;

      // check 'onLeave' guard. Revert URL if it returns false.
      if (oldCfg?.onLeave) {
        if (untracked(() => oldCfg.onLeave!(this)) === false) {
          this.restoreUrl();
          return;
        }
      }

      oldRouteAtom.value = nextRoute;
    }

    this.queryParamsAtom.value = this.getQueryParams();

    // Ensure path parameters are updated as well for the next route.
    const { params } = this.matchRoute(oldRouteAtom.peek());
    const paramsAtom = this.paramsAtom;
    if (!this.areParamsEqual(paramsAtom.peek(), params)) {
      paramsAtom.value = params;
    }
    this.previousUrl = currentUrl;
  }

  /**
   * Hardens SPAs by intercepting <a> tags and [data-route] elements.
   * Standardizes navigation behaviors (Ctrl+click, meta, etc.).
   */
  private setupAutoBindLinks(): void {
    if (!this.config.autoBindLinks) return;

    const onClick = (e: JQuery.TriggeredEvent) => {
      const oe = e.originalEvent as MouseEvent;
      // Standard browser patterns: allow Ctrl/Command/Shift clicks to bypass SPA router.
      if (oe && (oe.ctrlKey || oe.metaKey || oe.altKey || oe.shiftKey || oe.button !== 0)) return;

      const el = e.currentTarget as HTMLElement;
      const dataRoute = el.dataset.route;

      // Skip elements explicitly ignored via data-ignore.
      if (el.hasAttribute('data-ignore')) return;

      if (el.tagName === 'A') {
        const anchor = el as HTMLAnchorElement;
        // Skip external, download, or non-origin links.
        if (anchor.rel === 'external') return;

        let routeName = dataRoute || '';
        if (!routeName) {
          if (anchor.target && anchor.target !== '_self') return;
          if (anchor.hasAttribute('download')) return;
          if (anchor.origin !== location.origin) return;

          if (this.isHistoryMode) {
            // Avoid interceptions for in-page hash changes.
            if (
              anchor.pathname === location.pathname &&
              anchor.search === location.search &&
              anchor.hash
            ) {
              return;
            }
            let path = anchor.pathname;
            const base = this.basePath;
            if (base && (path === base || path.startsWith(`${base}/`))) {
              path = path.substring(base.length);
            }
            routeName = this.normalizePath(path) + anchor.search;
          } else {
            if (!anchor.hash || anchor.hash[0] !== '#') return;
            routeName = this.normalizePath(anchor.hash.substring(1));
          }
        }

        const { route } = this.splitPath(routeName);
        const match = this.matchRoute(route);

        // Intercept ONLY if the route exists within the configuration.
        if (match.compiled || (this.config.notFound && this.config.routes[this.config.notFound])) {
          e.preventDefault();
          this.navigate(routeName);
        }
      } else if (dataRoute != null) {
        e.preventDefault();
        this.navigate(dataRoute);
      }
    };

    $(document).on('click', '[data-route]', onClick);
    this.cleanups.push(() => $(document).off('click', '[data-route]', onClick));

    // Side effect to maintain the 'activeClass' on bound link elements.
    let previousActiveNodes: HTMLElement[] = [];
    const activeLinkEffect = effect(() => {
      const activePath = this.currentRouteAtom.value;
      const activeClass = this.activeClass;

      untracked(() => {
        const { compiled: activeCompiled } = this.matchRoute(activePath);
        const activePattern = activeCompiled ? activeCompiled.pattern : '';

        // Optimized: Clear previous active nodes first.
        const pLen = previousActiveNodes.length;
        for (let i = 0; i < pLen; i++) {
          const el = previousActiveNodes[i]!;
          el.classList.remove(activeClass);
          el.removeAttribute('aria-current');
        }

        try {
          const nodes = document.querySelectorAll<HTMLElement>('[data-route]');
          const nLen = nodes.length;
          const nextActiveNodes: HTMLElement[] = [];

          const historyMode = this.isHistoryMode;
          const basePath = this.basePath;
          const cache = this.linkRouteCache;

          for (let i = 0; i < nLen; i++) {
            const el = nodes[i]!;
            let elRouteName = cache.get(el);

            // Lazy resolve the route name for each link element to minimize string ops.
            if (elRouteName === undefined) {
              const dataRoute = el.dataset.route;
              elRouteName = dataRoute || '';

              if (dataRoute && dataRoute.indexOf('?') !== -1) {
                elRouteName = dataRoute.substring(0, dataRoute.indexOf('?'));
              } else if (!elRouteName && el.tagName === 'A') {
                const anchor = el as HTMLAnchorElement;
                if (historyMode) {
                  let path = anchor.pathname;
                  if (basePath && path.startsWith(basePath)) path = path.substring(basePath.length);
                  elRouteName = this.normalizePath(path);
                } else if (anchor.hash && anchor.hash[0] === '#') {
                  const rawHash = anchor.hash.substring(1);
                  const qIdx = rawHash.indexOf('?');
                  elRouteName = this.normalizePath(
                    qIdx !== -1 ? rawHash.substring(0, qIdx) : rawHash
                  );
                }
              }
              cache.set(el, elRouteName);
            }

            if (!elRouteName) continue;

            // Mark nodes as active if they point to the current active route pattern or path.
            if (elRouteName === activePath || elRouteName === activePattern) {
              el.classList.add(activeClass);
              el.setAttribute('aria-current', 'page');
              nextActiveNodes.push(el);
            }
          }
          previousActiveNodes = nextActiveNodes;
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
   * Programmatically navigate to a route.
   * @param name - String path (e.g., 'home', 'user/42', or 'search?q=foo').
   */
  public navigate(name: string): void {
    if (this.isDestroyed) return;

    const old = this.currentRouteAtom.peek();
    const { compiled: oldCompiled } = this.matchRoute(old);
    const oldCfg = oldCompiled
      ? oldCompiled.def
      : this.config.notFound
        ? this.config.routes[this.config.notFound]
        : undefined;

    // Run 'onLeave' guard before starting navigation.
    if (oldCfg?.onLeave && untracked(() => oldCfg.onLeave!(this)) === false) return;

    const { route: routePart, query: queryPart } = this.splitPath(name);
    const resolvedRoute = routePart || this.config.default || '';
    if (!resolvedRoute) return;

    $.batch(() => {
      this.setUrl(name);

      const queryParamsAtom = this.queryParamsAtom;
      const nextParams = queryPart ? this.parseQueryParams(queryPart) : {};
      if (!this.areParamsEqual(nextParams, queryParamsAtom.peek())) {
        queryParamsAtom.value = nextParams;
      }

      this.currentRouteAtom.value = resolvedRoute;

      // Match again to resolve parameters for the target route.
      const { params } = this.matchRoute(resolvedRoute);
      const paramsAtom = this.paramsAtom;
      if (!this.areParamsEqual(paramsAtom.peek(), params)) {
        paramsAtom.value = params;
      }
    });
  }

  /**
   * Tears down the router, removes global event listeners, and releases memory.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    const cleanups = this.cleanups;
    const len = cleanups.length;
    for (let i = 0; i < len; i++) {
      try {
        cleanups[i]!();
      } catch {}
    }
    cleanups.length = 0;
    this.templateCache.clear();
  }
}

/**
 * Factory function to create a new SPA Router.
 *
 * @example
 * ```ts
 * const router = $.route({
 *   target: '#app',
 *   routes: {
 *     'home': { template: '#tpl-home' },
 *     'user/:id': { onEnter: (params) => { ... } }
 *   }
 * });
 * ```
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

$.extend({ route });
