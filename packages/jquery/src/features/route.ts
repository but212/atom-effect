import {
  batch,
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

/** Internal utilities for consistent path manipulation across adapters. */
const PathUtils = {
  normalize: (path: string): string => path.replace(/(^\/+|\/+$)/g, ''),

  split: (path: string): { route: string; query: string | undefined } => {
    const [route, query] = path.split('?');
    return { route: PathUtils.normalize(route || ''), query };
  },

  isSameParams: (a: Record<string, string>, b: Record<string, string>): boolean => {
    if (a === b) return true;
    const ka = Object.keys(a),
      kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  },
};

function parseQueryParams(raw: string): Record<string, string> {
  const res: Record<string, string> = {};
  if (!raw) return res;

  try {
    decodeURIComponent(raw);
  } catch {
    debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.MALFORMED_URI(raw));
  }

  try {
    new URLSearchParams(raw).forEach((v, k) => {
      res[k] = v;
    });
  } catch {}
  return res;
}

type URLState = {
  readonly path: string;
  readonly query: Record<string, string>;
  readonly url: string;
};

/**
 * Abstract interface for synchronizing the router with browser URL mechanisms.
 *
 * @internal
 */
interface UrlAdapter {
  readonly getBrowserState: () => URLState;
  readonly commit: (fullPath: string) => URLState;
  readonly revert: (previousUrl: string) => void;
  readonly resolveAnchor: (el: HTMLAnchorElement) => string;
  readonly setupListener: (handler: () => void) => () => void;
}

/** Implementation for modern browsers using the HTML5 History API (pushState). */
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

/** Implementation for legacy support or static environments using URL fragments (#). */
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

type CompiledRoute =
  | {
      readonly kind: 'exact';
      readonly pattern: string;
      readonly def: RouteDefinition;
    }
  | {
      readonly kind: 'dynamic';
      readonly pattern: string;
      readonly regex: RegExp;
      readonly paramNames: readonly string[];
      readonly def: RouteDefinition;
    };

type MatchResult =
  | {
      readonly kind: 'found';
      readonly route: CompiledRoute;
      readonly params: Record<string, string>;
    }
  | { readonly kind: 'not-found' };

/**
 * Compiles route patterns into Regex for high-performance URL matching.
 *
 * Logic: Regex Transformation
 * Converts path patterns (e.g., `/user/:id`) into anchored regular expressions.
 * Escapes special characters while transforming `:param` tokens into
 * capturing groups for efficient extraction of route parameters.
 *
 * @internal
 */
class RouteMatcher {
  private readonly routes: CompiledRoute[] = [];

  constructor(routes: Record<string, RouteDefinition>) {
    Object.entries(routes).forEach(([path, def]) => {
      const normalized = PathUtils.normalize(path);
      if (!normalized.includes(':')) {
        this.routes.push({ kind: 'exact', pattern: normalized, def });
      } else {
        const paramNames: string[] = [];
        // Regex Transformation: Converts '/user/:id' into a regex with capture groups.
        const regexStr = normalized
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/:(\w+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
          });

        this.routes.push({
          kind: 'dynamic',
          pattern: normalized,
          regex: new RegExp(`^${regexStr}$`),
          paramNames,
          def,
        });
      }
    });
  }

  match(path: string): MatchResult {
    const normalized = PathUtils.normalize(path);

    for (const route of this.routes) {
      if (route.kind === 'exact') {
        if (route.pattern === normalized) return { kind: 'found', route, params: {} };
      } else {
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
    }
    return { kind: 'not-found' };
  }
}

/** Orchestrates the reactive routing logic, History/Hash adaptation, and view rendering. */
class RouterImpl implements Router {
  /** Reactive current path (read-only). */
  public currentRoute: ReadonlyAtom<string>;
  /** Reactive key-value map of URL query parameters. */
  public queryParams: ReadonlyAtom<Record<string, string>>;
  /** Combined reactive map of route params (e.g. :id) and query params. */
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

  constructor(config: RouteConfig) {
    this.config = this.parseConfig(config);
    this.activeClass = this.config.activeClass;

    const target = this.config.target;
    if (typeof target === 'string') {
      this.$target = $(target);
    } else if (target instanceof HTMLElement) {
      this.$target = $(target);
    } else {
      this.$target = target as JQuery<HTMLElement>;
    }

    this.urlAdapter =
      this.config.mode === 'history'
        ? createHistoryAdapter(this.config.basePath)
        : createHashAdapter();

    this.discoverRoutesFromDOM();
    this.matcher = new RouteMatcher(this.config.routes);

    const initState = this.urlAdapter.getBrowserState();
    this.previousUrl = initState.url;

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

  private setupLifecycle() {
    this.cleanups.push(this.urlAdapter.setupListener(() => this.handleBrowserSync()));

    const renderSub = effect(() => {
      const path = this.currentRouteAtom.value;
      // Dependency: Implicitly tracks queryParamsAtom to re-render if query changes.
      this.queryParamsAtom.value;

      untracked(() => {
        this.runRouteCleanups();
        this.render(path);
      });
    });
    this.cleanups.push(() => renderSub.dispose());

    if (this.config.autoBindLinks) this.setupInterception();
    if (this.$target[0]) {
      registry.trackCleanup(this.$target[0], () => this.destroy());
    }
  }

  /**
   * Navigates to a new path.
   *
   * Logic: Navigation Guard
   * Intercepts the transition and executes the `onLeave` guard. If any
   * guard returns `false`, the navigation is aborted, preventing
   * data loss in unsaved forms or complex states.
   */
  public navigate(path: string): void {
    if (this.isDestroyed || !this.canLeave()) return;

    const { route, query } = PathUtils.split(path);
    const targetPath = route || this.config.default;
    if (!targetPath) return;

    const fullPath = query ? `${targetPath}?${query}` : targetPath;

    batch(() => {
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

  /** Syncs internal state with browser back/forward button events. Supports nav guards. */
  private handleBrowserSync() {
    if (this.isDestroyed) return;
    const state = this.urlAdapter.getBrowserState();
    if (state.url === this.previousUrl) return;

    const nextPath = state.path || this.config.default;
    if (this.currentRouteAtom.peek() !== nextPath) {
      if (!this.canLeave()) {
        // Revert: If navigation is blocked by a guard, force the browser URL back to the previous state.
        this.urlAdapter.revert(this.previousUrl);
        return;
      }
      this.currentRouteAtom.value = nextPath;
    }

    this.queryParamsAtom.value = state.query;
    this.previousUrl = state.url;
  }

  /**
   * Executes the route transition lifecycle.
   *
   * Lifecycle: Transition Stages
   * 1. `beforeTransition`: Global hook execution.
   * 2. `onEnter`: Route-specific guard and parameter pre-processing.
   * 3. `updateDom`: Actual HTML injection or template rendering.
   * 4. `afterTransition`: Global completion hook.
   * 5. `finalizeNavigation`: Metadata updates and accessibility focus reset.
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
      // Guard: Allows synchronous blocking of the current navigation.
      const hookResult = untracked(() => def.onEnter!(mergedParams, this));
      if (hookResult === false) {
        this.urlAdapter.revert(this.previousUrl);
        return;
      }
      if (hookResult) Object.assign(mergedParams, hookResult);
    }

    if (!PathUtils.isSameParams(this.paramsAtom.peek(), mergedParams)) {
      this.paramsAtom.value = mergedParams;
    }

    if (def.title) document.title = def.title;
    this.updateDom(def, routeName, mergedParams);

    untracked(() => this.config.afterTransition(this.previousPath, routeName));
    this.finalizeNavigation(routeName, mergedParams);
  }

  /** Performs the actual HTML injection and executes onMount hooks. */
  private updateDom(def: RouteDefinition, name: string, params: Record<string, string>) {
    const container = this.$target[0];
    if (!container) return;
    container.replaceChildren();

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

  /** Scans the DOM for <template data-path="..."> elements to automatically register routes. */
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

  /** Global click hijacker for link-based navigation. Filters out external links and modifier clicks. */
  private setupInterception() {
    const onClick = (e: JQuery.TriggeredEvent) => {
      const me = e.originalEvent as MouseEvent;
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

  /** Reactive effect that automatically toggles the 'activeClass' on links matching the current route. */
  private setupActiveEffect() {
    const activeSub = effect(() => {
      const current = this.currentRouteAtom.value;
      const matchResult = this.matcher.match(current);
      const pattern = matchResult.kind === 'found' ? matchResult.route.pattern : '';

      untracked(() => {
        document.querySelectorAll<HTMLElement>('a, [data-route]').forEach((el) => {
          const path = this.resolvePathFromElement(el, true);
          const active = path === current || path === pattern;
          el.classList.toggle(this.activeClass, active);
          // Accessibility: Updates aria-current to signal active navigation for screen readers.
          if (active) el.setAttribute('aria-current', 'page');
          else el.removeAttribute('aria-current');
        });
      });
    });
    this.cleanups.push(() => activeSub.dispose());
  }

  private resolvePathFromElement(el: HTMLElement, stripQuery = false): string {
    let path = el.dataset.route || '';
    if (!path && el instanceof HTMLAnchorElement) {
      path = this.urlAdapter.resolveAnchor(el);
    }
    return stripQuery ? PathUtils.split(path).route : path;
  }

  /**
   * Heuristics to decide if a link click should be handled by the router.
   *
   * Logic: Link Interception Policy
   * Bypasses interception for:
   * - External domains or `rel="external"` links.
   * - Files with extensions (e.g., `.pdf`) unless a route is explicitly matched.
   * - Links with modifier keys (Ctrl/Cmd/Shift) to preserve native tab behavior.
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

      // Logic: Ignore clicks to file paths (.jpg, .pdf) that don't match a registered route.
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

  private canLeave(): boolean {
    const matchResult = this.matcher.match(this.currentRouteAtom.peek());
    const def =
      matchResult.kind === 'found'
        ? matchResult.route.def
        : this.config.routes[this.config.notFound];
    return def?.onLeave ? untracked(() => def.onLeave!(this)) !== false : true;
  }

  private getTemplate(selector: string) {
    const el = document.querySelector(selector);
    return el instanceof HTMLTemplateElement ? el : null;
  }

  private runRouteCleanups() {
    this.routeCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.routeCleanups = [];
  }

  /**
   * Finalizes a successful navigation event.
   *
   * Accessibility: SPA Focus Management
   * Resets the document focus to the main heading (`h1`) or the target
   * container to ensure that screen readers announce the new page content
   * instead of remaining silent on the triggered link.
   */
  private finalizeNavigation(routeName: string, params: Record<string, string>) {
    window.dispatchEvent(
      new CustomEvent('route-change', {
        detail: { from: this.previousPath, to: routeName, params },
      })
    );

    const targetElement = this.$target[0];
    if (!targetElement) return;

    // Accessibility: Reset focus to the main heading or container to handle SPA navigation for screen readers.
    const heading = targetElement.querySelector('h1, [role="heading"]');
    const focusTarget = heading instanceof HTMLElement ? heading : targetElement;
    focusTarget.tabIndex = -1;
    focusTarget.focus();

    this.previousPath = routeName;
  }

  /** Destroys the router instance, cleaning up all event listeners and reactive subscriptions. */
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
  }
}

/**
 * Initializes a client-side router for the application.
 *
 * Logic: Reactive Routing
 * Orchestrates URL synchronization, path matching, and dynamic view rendering.
 * Uses atoms to provide reactive access to `currentRoute` and `params`,
 * enabling secondary UI elements to reactively update sidebars or breadcrumbs.
 *
 * Capabilities:
 * - Multi-mode support: 'history' (pushState) or 'hash' for legacy support.
 * - Dynamic matching: High-performance param extraction for named route segments.
 * - Reactive state: Integrated with the core atom system for effortless UI syncing.
 * - Lifecycle hooks: Fine-grained navigation control via `onEnter` and `onLeave`.
 *
 * @example
 * ```typescript
 * const router = $.route({
 *   target: '#app',
 *   routes: {
 *     '/': { template: '#home-tmpl' },
 *     '/user/:id': {
 *       render: (el, name, params) => {
 *         $(el).text(`User Profile: ${params.id}`);
 *       }
 *     }
 *   }
 * });
 * ```
 *
 * @public
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

$.extend({ route });
