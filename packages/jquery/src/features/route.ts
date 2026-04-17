import {
  computed,
  atom as createAtom,
  effect,
  type ReadonlyAtom,
  untracked,
} from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES, ROUTE_DEFAULTS } from '@/constants';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

// --- Pure Utilities (Stateless) ---

/**
 * Internal utilities for path manipulation and comparison.
 */
const PathUtils = {
  /**
   * Removes leading and trailing slashes from a path.
   * @param path The path string to normalize.
   * @returns Normalized path string without surrounding slashes.
   */
  normalize: (path: string): string => path.replace(/(^\/+|\/+$)/g, ''),

  /**
   * Splits a URL-like string into its path and query parts.
   * @param path Full path string possibly containing query parameters.
   * @returns An object with normalized `route` and raw `query` string.
   */
  split: (path: string): { route: string; query: string | undefined } => {
    const [route, query] = path.split('?');
    return { route: PathUtils.normalize(route || ''), query };
  },

  /**
   * Simple shallow equality check for parameter records.
   * @param a First parameters object.
   * @param b Second parameters object.
   * @returns True if both objects have the same keys and values.
   */
  isSameParams: (a: Record<string, string>, b: Record<string, string>): boolean => {
    if (a === b) return true;
    const ka = Object.keys(a),
      kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  },
};

/**
 * Parses a raw query string into a key-value record.
 * @param raw The query string (excluding the leading '?').
 * @returns Object mapping parameter names to their decoded values.
 */
function parseQueryParams(raw: string): Record<string, string> {
  const res: Record<string, string> = {};
  if (!raw) return res;
  try {
    // Check for encoded sequences before parsing to provide better debug warnings
    if (raw.includes('%')) decodeURIComponent(raw);
    new URLSearchParams(raw).forEach((v, k) => {
      res[k] = v;
    });
  } catch {
    debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.MALFORMED_URI(raw));
  }
  return res;
}

// --- Domain Models & Adapters ---

/**
 * Represents the current state of the browser's URL.
 */
type URLState = {
  /** Normalized path part. */
  readonly path: string;
  /** Parsed query parameters. */
  readonly query: Record<string, string>;
  /** The full raw URL as stored in the browser. */
  readonly url: string;
};

/**
 * Strategy interface for interacting with different browser navigation modes.
 * Abstracts the differences between History API and Hash-based routing.
 */
interface UrlAdapter {
  /** Fetches the current state from the browser location. */
  readonly getBrowserState: () => URLState;
  /** Persists a new path to the browser location and returns the new state. */
  readonly commit: (fullPath: string) => URLState;
  /** Reverts the browser location to a previous URL. */
  readonly revert: (previousUrl: string) => void;
  /** Extracts the logical route path from a clicked anchor element. */
  readonly resolveAnchor: (el: HTMLAnchorElement) => string;
  /** Registers a listener for browser navigation events (back/forward). */
  readonly setupListener: (handler: () => void) => () => void;
}

/**
 * Implementation of UrlAdapter using the standard History API.
 */
const createHistoryAdapter = (basePathRaw?: string): UrlAdapter => {
  const basePath = basePathRaw ? `/${PathUtils.normalize(basePathRaw)}` : '';
  const absoluteBase = `${location.origin}${basePath}/`.replace(/\/+$/, '/');

  return {
    getBrowserState: () => {
      let p = location.pathname;
      if (basePath && p.startsWith(basePath)) p = p.substring(basePath.length);
      return {
        path: PathUtils.normalize(p),
        query: parseQueryParams(location.search.substring(1)),
        url: location.pathname + location.search,
      };
    },
    commit: (fullPath) => {
      const { route, query } = PathUtils.split(fullPath);
      const url = new URL(route, absoluteBase);
      if (query) url.search = query;
      const urlStr = url.pathname + url.search;
      try {
        history.pushState(null, '', urlStr);
      } catch {}
      return {
        path: PathUtils.normalize(route),
        query: parseQueryParams(query || ''),
        url: urlStr,
      };
    },
    revert: (previousUrl) => {
      const current = location.pathname + location.search;
      if (current !== previousUrl) {
        try {
          history.replaceState(null, '', previousUrl);
        } catch {}
      }
    },
    resolveAnchor: (el) => {
      let p = el.pathname;
      if (basePath && p.startsWith(basePath)) p = p.substring(basePath.length);
      return PathUtils.normalize(p) + el.search;
    },
    setupListener: (handler) => {
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    },
  };
};

/**
 * Implementation of UrlAdapter using location.hash for older browsers or simple deployments.
 */
const createHashAdapter = (): UrlAdapter => {
  return {
    getBrowserState: () => {
      const hash = location.hash;
      const raw = hash.startsWith('#') ? hash.substring(1) : hash;
      const { route, query } = PathUtils.split(raw);
      return { path: route, query: parseQueryParams(query || ''), url: hash };
    },
    commit: (fullPath) => {
      const { route, query } = PathUtils.split(fullPath);
      const url = `#${query ? `${route}?${query}` : route}`;
      location.hash = url;
      return { path: PathUtils.normalize(route), query: parseQueryParams(query || ''), url };
    },
    revert: (previousUrl) => {
      if (location.hash !== previousUrl) location.hash = previousUrl;
    },
    resolveAnchor: (el) => {
      return el.hash.startsWith('#') ? PathUtils.normalize(el.hash.substring(1)) : '';
    },
    setupListener: (handler) => {
      window.addEventListener('hashchange', handler);
      return () => window.removeEventListener('hashchange', handler);
    },
  };
};

/**
 * Represents a route that has been processed for matching.
 */
type CompiledRoute =
  | {
      /** Simple static route that doesn't contain placeholders. */
      readonly kind: 'exact';
      readonly pattern: string;
      readonly def: RouteDefinition;
    }
  | {
      /** Dynamic route with path parameters (e.g., /user/:id). */
      readonly kind: 'dynamic';
      readonly pattern: string;
      readonly regex: RegExp;
      readonly paramNames: readonly string[];
      readonly def: RouteDefinition;
    };

/**
 * Result of a matching operation.
 */
type MatchResult =
  | {
      readonly kind: 'found';
      readonly route: CompiledRoute;
      readonly params: Record<string, string>;
    }
  | { readonly kind: 'not-found' };

/**
 * Manage the registration and matching of routes against URL paths.
 * Pre-computes regular expressions for efficient lookup.
 */
class RouteMatcher {
  private readonly exact = new Map<string, CompiledRoute>();
  private readonly dynamic: Extract<CompiledRoute, { kind: 'dynamic' }>[] = [];

  constructor(routes: Record<string, RouteDefinition>) {
    Object.entries(routes).forEach(([path, def]) => {
      const normalized = PathUtils.normalize(path);
      if (!normalized.includes(':')) {
        this.exact.set(normalized, { kind: 'exact', pattern: normalized, def });
      } else {
        const paramNames: string[] = [];
        const regexStr = normalized
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/:(\w+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
          });

        this.dynamic.push({
          kind: 'dynamic',
          pattern: normalized,
          regex: new RegExp(`^${regexStr}$`),
          paramNames,
          def,
        });
      }
    });
  }

  /**
   * Matches a path against registered routes.
   * Priority: Static Match > Dynamic Match > Not Found.
   *
   * @param path The path to match.
   * @returns Match result containing the definition and extracted parameters.
   */
  match(path: string): MatchResult {
    const normalized = PathUtils.normalize(path);
    const exactMatch = this.exact.get(normalized);
    if (exactMatch) return { kind: 'found', route: exactMatch, params: {} };

    for (const route of this.dynamic) {
      const match = normalized.match(route.regex);
      if (match) {
        const params = route.paramNames.reduce(
          (acc, name, i) => {
            try {
              acc[name] = decodeURIComponent(match[i + 1] || '');
            } catch {
              acc[name] = match[i + 1] || '';
            }
            return acc;
          },
          {} as Record<string, string>
        );
        return { kind: 'found', route, params };
      }
    }
    return { kind: 'not-found' };
  }
}

/**
 * Main implementation of the SPA Router.
 *
 * Manages the marriage between browser navigation (history/hash) and
 * reactive state (atoms). It handles route discovery from DOM,
 * link interception, guard execution, and efficient DOM swap.
 */
class RouterImpl implements Router {
  /** Reactive name of the current active route pattern. */
  public currentRoute: ReadonlyAtom<string>;
  /** Reactive record of current query parameters from the URL. */
  public queryParams: ReadonlyAtom<Record<string, string>>;
  /** Integrated reactive record of both route path parameters and query parameters. */
  public params: ReadonlyAtom<Record<string, string>>;

  private readonly matcher: RouteMatcher;
  private readonly config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  private readonly urlAdapter: UrlAdapter;
  private readonly $target: JQuery<HTMLElement>;
  private readonly activeClass: string;

  private readonly currentRouteAtom: WritableAtom<string>;
  private readonly queryParamsAtom: WritableAtom<Record<string, string>>;
  private readonly paramsAtom: WritableAtom<Record<string, string>>;

  private isDestroyed = false;
  private previousPath = '';
  private previousUrl = '';

  private cleanups: (() => void)[] = [];
  private routeCleanups: (() => void)[] = [];
  private readonly templateCache = new Map<string, HTMLTemplateElement>();
  private readonly linkRouteCache = new WeakMap<HTMLElement, string>();

  /**
   * Initializes the router and starts listening for events.
   * @param config User-provided configuration.
   */
  constructor(config: RouteConfig) {
    this.config = this.parseConfig(config);
    this.activeClass = this.config.activeClass;

    // Resolve target element safely for both jQuery and DOM users
    const target = this.config.target;
    if (typeof target === 'string') {
      this.$target = $(target);
    } else if (target instanceof HTMLElement) {
      this.$target = $(target);
    } else {
      this.$target = target as JQuery<HTMLElement>;
    }

    // Initialize navigation mode strategy
    this.urlAdapter =
      this.config.mode === 'history'
        ? createHistoryAdapter(this.config.basePath)
        : createHashAdapter();

    // Setup routes and synchronization
    this.discoverRoutesFromDOM();
    this.matcher = new RouteMatcher(this.config.routes);

    const initState = this.urlAdapter.getBrowserState();
    this.previousUrl = initState.url;

    // Setup reactive synchronization
    const initialPath = initState.path || this.config.default;
    this.currentRouteAtom = createAtom(initialPath);
    this.currentRoute = this.currentRouteAtom;

    this.queryParamsAtom = createAtom(initState.query);
    this.queryParams = computed(() => this.queryParamsAtom.value);

    const firstMatch = this.matcher.match(initialPath);
    const initialParams = firstMatch.kind === 'found' ? firstMatch.params : {};
    this.paramsAtom = createAtom({ ...initState.query, ...initialParams });
    this.params = computed(() => this.paramsAtom.value);

    this.setupLifecycle();
  }

  /**
   * Merges user config with project defaults.
   */
  private parseConfig(c: RouteConfig) {
    return {
      mode: ROUTE_DEFAULTS.mode,
      basePath: ROUTE_DEFAULTS.basePath,
      autoBindLinks: ROUTE_DEFAULTS.autoBindLinks,
      activeClass: ROUTE_DEFAULTS.activeClass,
      notFound: c.notFound || '',
      beforeTransition: c.beforeTransition || (() => {}),
      afterTransition: c.afterTransition || (() => {}),
      default: c.default || '',
      ...c,
      routes: c.routes || {},
    } as Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  }

  /**
   * Attaches global listeners and sets up the reactive rendering cycle.
   */
  private setupLifecycle() {
    this.cleanups.push(this.urlAdapter.setupListener(() => this.handleBrowserSync()));

    // Essential Rendering Effect: Redraws UI whenever URL state (path/query) changes
    const renderSub = effect(() => {
      const path = this.currentRouteAtom.value;
      this.queryParamsAtom.value;

      untracked(() => {
        this.runRouteCleanups();
        this.render(path);
      });
    });
    this.cleanups.push(() => renderSub.dispose());

    // Link Interception and Global Registry Cleanup
    if (this.config.autoBindLinks) this.setupInterception();
    if (this.$target[0]) {
      registry.trackCleanup(this.$target[0], () => this.destroy());
    }
  }

  /**
   * Programmatically navigates to a new destination.
   * Runs leave guards and updates the browser URL and internal state.
   *
   * @param path Target URL part (e.g., 'home', 'user/123', 'search?q=query').
   */
  public navigate(path: string): void {
    if (this.isDestroyed || !this.canLeave()) return;

    const { route, query } = PathUtils.split(path);
    const targetPath = route || this.config.default;
    if (!targetPath) return;

    const fullPath = query ? `${targetPath}?${query}` : targetPath;

    // Atomically update state to prevent multiple render cycles
    $.batch(() => {
      const nextState = this.urlAdapter.commit(fullPath);
      this.previousUrl = nextState.url;

      if (!PathUtils.isSameParams(this.queryParamsAtom.peek(), nextState.query)) {
        this.queryParamsAtom.value = nextState.query;
      }

      const current = this.currentRouteAtom.peek();
      if (current !== nextState.path) {
        this.currentRouteAtom.value = nextState.path;
      }
    });
  }

  /**
   * Responds to browser 'back' and 'forward' actions.
   */
  private handleBrowserSync() {
    if (this.isDestroyed) return;
    const state = this.urlAdapter.getBrowserState();
    if (state.url === this.previousUrl) return;

    const nextPath = state.path || this.config.default;
    if (this.currentRouteAtom.peek() !== nextPath) {
      if (!this.canLeave()) {
        this.urlAdapter.revert(this.previousUrl);
        return;
      }
      this.currentRouteAtom.value = nextPath;
    }

    this.queryParamsAtom.value = state.query;
    this.previousUrl = state.url;
  }

  /**
   * Executes the full transition logic for a requested path.
   * 1. Resolution & Matching
   * 2. Guards & Lifecycle Hook (beforeTransition, onEnter)
   * 3. DOM Update & Cleanup
   * 4. Post-Navigation Actions (afterTransition, A11y focus)
   *
   * @param requestedPath Normalized path to render.
   */
  private render(requestedPath: string): void {
    const matchResult = this.matcher.match(requestedPath);
    const def =
      matchResult.kind === 'found'
        ? matchResult.route.def
        : this.config.routes[this.config.notFound];

    if (!def) {
      debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.NOT_FOUND(requestedPath));
      return;
    }

    const routeName = matchResult.kind === 'found' ? matchResult.route.pattern : requestedPath;
    const pathParams = matchResult.kind === 'found' ? matchResult.params : {};
    const mergedParams = { ...this.queryParamsAtom.peek(), ...pathParams };

    untracked(() => this.config.beforeTransition(this.previousPath, routeName));

    if (def.onEnter) {
      const hookResult = untracked(() => def.onEnter!(mergedParams, this));
      if (hookResult === false) {
        this.urlAdapter.revert(this.previousUrl);
        return;
      }
      if (hookResult) Object.assign(mergedParams, hookResult);
    }

    // Refresh params atom with merged view
    if (!PathUtils.isSameParams(this.paramsAtom.peek(), mergedParams)) {
      this.paramsAtom.value = mergedParams;
    }

    // Reflect metadata and content to DOM
    if (def.title) document.title = def.title;
    this.updateDom(def, routeName, mergedParams);

    untracked(() => this.config.afterTransition(this.previousPath, routeName));
    this.finalizeNavigation(routeName, mergedParams);
  }

  /**
   * Swaps the target container content based on the route definition.
   */
  private updateDom(def: RouteDefinition, name: string, params: Record<string, string>) {
    const container = this.$target[0];
    if (!container) return;
    container.replaceChildren(); // High performance DOM clearing

    const onUnmount = (fn: () => void) => this.routeCleanups.push(fn);

    if (def.render) {
      def.render(container, name, params, onUnmount, this);
    } else if (def.template) {
      const tmpl = this.getTemplate(def.template);
      if (tmpl) {
        container.appendChild(tmpl.content.cloneNode(true));
        def.onMount?.($(container).children(), onUnmount, this);
      }
    }
  }

  /**
   * Scans the document for <template data-path="..."> to auto-register routes.
   */
  private discoverRoutesFromDOM() {
    document.querySelectorAll<HTMLTemplateElement>('template[data-path]').forEach((tmpl) => {
      const path = PathUtils.normalize(tmpl.getAttribute('data-path') || '');
      const title = tmpl.getAttribute('title') || tmpl.getAttribute('data-title');

      const existing = this.config.routes[path];
      if (!existing) {
        if (!tmpl.id) tmpl.id = `route-${Math.random().toString(36).substring(2, 9)}`;
        this.config.routes[path] = {
          template: `#${tmpl.id}`,
          ...(title ? { title } : {}),
        };
      } else if (title && !existing.title) {
        existing.title = title;
      }

      if (tmpl.hasAttribute('data-default') && !this.config.default) {
        this.config.default = path;
      }
    });
  }

  /**
   * Sets up delegation to intercept clicks on anchors or [data-route] elements.
   */
  private setupInterception() {
    const onClick = (e: JQuery.TriggeredEvent) => {
      const me = e.originalEvent as MouseEvent;
      // Allow standard browser behavior for modifier keys (Ctrl/Cmd click)
      if (me && (me.ctrlKey || me.metaKey || me.altKey || me.shiftKey || me.button !== 0)) return;

      const el = e.currentTarget as HTMLElement;
      if (el.hasAttribute('data-ignore')) return;

      const path = this.resolvePathFromElement(el);
      if (path && this.shouldIntercept(path, el)) {
        e.preventDefault();
        this.navigate(path);
      }
    };

    $(document).on('click', 'a, [data-route]', onClick);
    this.cleanups.push(() => $(document).off('click', 'a, [data-route]', onClick));
    this.setupActiveEffect();
  }

  /**
   * Automatically adds and removes active CSS class on links matching current route.
   */
  private setupActiveEffect() {
    let activeNodes: HTMLElement[] = [];
    const activeSub = effect(() => {
      const current = this.currentRouteAtom.value;
      const matchResult = this.matcher.match(current);
      const pattern = matchResult.kind === 'found' ? matchResult.route.pattern : '';

      untracked(() => {
        // Cleanup previous state
        activeNodes.forEach((n) => {
          n.classList.remove(this.activeClass);
          n.removeAttribute('aria-current');
        });
        activeNodes = [];

        // Update nodes matching current route
        document.querySelectorAll<HTMLElement>('a, [data-route]').forEach((el) => {
          const path = this.resolvePathFromElement(el, true);
          if (path === current || path === pattern) {
            el.classList.add(this.activeClass);
            el.setAttribute('aria-current', 'page');
            activeNodes.push(el);
          }
        });
      });
    });
    this.cleanups.push(() => activeSub.dispose());
  }

  /**
   * Resolves the target route path from an element's attributes (dataset or href).
   */
  private resolvePathFromElement(el: HTMLElement, stripQuery = false): string {
    let path = this.linkRouteCache.get(el);
    if (path === undefined) {
      path = el.dataset.route || '';
      if (!path && el instanceof HTMLAnchorElement) {
        path = this.urlAdapter.resolveAnchor(el);
      }
      this.linkRouteCache.set(el, path);
    }
    return stripQuery ? PathUtils.split(path).route : path;
  }

  /**
   * Determines if a click event should be intercepted and handled by the router.
   */
  private shouldIntercept(path: string, el: HTMLElement): boolean {
    if (el instanceof HTMLAnchorElement) {
      if (
        el.rel === 'external' ||
        (el.target && el.target !== '_self') ||
        el.hasAttribute('download')
      )
        return false;
      if (el.origin !== location.origin) return false;

      // Do not intercept links with extensions (likely files) unless they are registered routes
      const last = path.split('/').pop() || '';
      if (
        last.includes('.') &&
        this.matcher.match(PathUtils.split(path).route).kind === 'not-found'
      )
        return false;
    }
    const { route } = PathUtils.split(path);
    return this.matcher.match(route).kind === 'found' || !!this.config.notFound;
  }

  /**
   * Runs the current route's onLeave guard.
   * @returns true if navigation is allowed, false to stay on current page.
   */
  private canLeave(): boolean {
    const matchResult = this.matcher.match(this.currentRouteAtom.peek());
    const def =
      matchResult.kind === 'found'
        ? matchResult.route.def
        : this.config.routes[this.config.notFound];
    return def?.onLeave ? untracked(() => def.onLeave!(this)) !== false : true;
  }

  /**
   * Internal cache-based selector for HTML Template elements.
   */
  private getTemplate(selector: string) {
    let tmpl = this.templateCache.get(selector);
    if (!tmpl) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLTemplateElement) {
        tmpl = el;
        this.templateCache.set(selector, tmpl);
      }
    }
    return tmpl || null;
  }

  /**
   * Runs all cleanup functions accumulated during the lifespan of the current route.
   */
  private runRouteCleanups() {
    this.routeCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.routeCleanups = [];
  }

  /**
   * Performs post-navigation global tasks like event dispatching and accessibility focus.
   */
  private finalizeNavigation(routeName: string, params: Record<string, string>) {
    window.dispatchEvent(
      new CustomEvent('route-change', {
        detail: { from: this.previousPath, to: routeName, params },
      })
    );

    // Manage A11y focus by targeting heading or container
    const targetElement = this.$target[0];
    if (!targetElement) return;

    const heading = targetElement.querySelector('h1, [role="heading"]');
    const focusTarget = heading instanceof HTMLElement ? heading : targetElement;
    focusTarget.tabIndex = -1;
    focusTarget.focus();

    this.previousPath = routeName;
  }

  /**
   * Completely destroys the router instance, cleaning up all global listeners and effects.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.runRouteCleanups();
    this.cleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.cleanups = [];
    this.templateCache.clear();
  }
}

/**
 * Factory function to create and initialize a new Router instance.
 *
 * @example
 * ```ts
 * const router = $.route({
 *   target: '#app-root',
 *   mode: 'history',
 *   default: 'home',
 *   routes: {
 *     'home': { template: '#tpl-home', title: 'Home' },
 *     'profile/:userId': {
 *       onEnter: (params) => { console.log(`Profile ${params.userId} loaded`); },
 *       render: (container, name, params) => {
 *         $(container).html(`<h1>Profile of ${params.userId}</h1>`);
 *       }
 *     }
 *   }
 * });
 *
 * // Programming navigation
 * router.navigate('profile/42');
 * ```
 *
 * @param config Configuration object for the router.
 * @returns An instance of RouterImpl.
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

// Register as jQuery static extension
$.extend({ route });
