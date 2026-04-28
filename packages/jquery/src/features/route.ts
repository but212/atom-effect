import {
  batch,
  computed,
  atom as createAtom,
  effect,
  type ReadonlyAtom,
  untracked,
} from '@but212/atom-effect';
import $ from 'jquery';
import { SYSTEM_COMPONENT, SYSTEM_ROUTE } from '@/constants';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Collection of internal path manipulation utilities.
 * @internal
 */
const PathUtils = {
  /** Removes leading and trailing slashes from a path. */
  normalize: (path: string): string => path.replace(/(^\/+|\/+$)/g, ''),

  /** Separates a path into its route and query string components. */
  split: (path: string): { route: string; query: string | undefined } => {
    const [route, query] = path.split('?');
    return { route: PathUtils.normalize(route ?? ''), query };
  },

  /** Compares two parameter maps for equality. */
  isSameParams: (a: Record<string, string>, b: Record<string, string>): boolean => {
    if (a === b) return true;
    const ka = Object.keys(a),
      kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  },
};

/**
 * Parses a raw query string into a key-value record.
 * @internal
 */
function parseQueryParams(raw: string): Record<string, string> {
  const res: Record<string, string> = {};
  if (!raw) return res;

  try {
    decodeURIComponent(raw);
  } catch {
    debug.warn(SYSTEM_ROUTE.PREFIX, SYSTEM_ROUTE.ERRORS.MALFORMED_URI(raw));
  }

  try {
    new URLSearchParams(raw).forEach((v, k) => {
      res[k] = v;
    });
  } catch {}
  return res;
}

/**
 * Represents the current parsed state of a URL.
 * @internal
 */
type URLState = {
  readonly path: string;
  readonly query: Record<string, string>;
  readonly url: string;
};

/**
 * Interface for coordinating router state with browser URL mechanisms.
 * @internal
 */
interface UrlAdapter {
  /** Retrieves the current path and query state from the browser. */
  readonly getBrowserState: () => URLState;
  /** Persists a new path to the browser history. */
  readonly commit: (fullPath: string) => URLState;
  /** Restores the browser URL to a previous state (used for navigation reverts). */
  readonly revert: (previousUrl: string) => void;
  /** Resolves the relative path from a clicked anchor element. */
  readonly resolveAnchor: (el: HTMLAnchorElement) => string;
  /** Establishes a listener for browser-driven navigation events (popstate/hashchange). */
  readonly setupListener: (handler: () => void) => () => void;
}

/**
 * Implementation of URL synchronization using the HTML5 History API.
 * @internal
 */
const createHistoryAdapter = (basePathRaw?: string): UrlAdapter => {
  const basePath = basePathRaw ? `/${PathUtils.normalize(basePathRaw)}` : '';
  const absoluteBase = `${location.origin}${basePath}/`.replace(/\/+$/, '/');

  return {
    getBrowserState: () => {
      let p = location.pathname;
      if (basePath && p.startsWith(basePath)) {
        p = p.substring(basePath.length);
      }
      return {
        path: PathUtils.normalize(p),
        query: parseQueryParams(location.search.substring(1)),
        url: location.pathname + location.search,
      };
    },
    commit: (fullPath) => {
      const { route, query } = PathUtils.split(fullPath);
      const url = new URL(route, absoluteBase);
      if (query) {
        url.search = query;
      }
      const urlStr = url.pathname + url.search;
      try {
        history.pushState(null, '', urlStr);
      } catch {}
      return {
        path: PathUtils.normalize(route),
        query: parseQueryParams(query ?? ''),
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
      if (basePath && p.startsWith(basePath)) {
        p = p.substring(basePath.length);
      }
      return PathUtils.normalize(p) + el.search;
    },
    setupListener: (handler) => {
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    },
  };
};

/**
 * Implementation of URL synchronization using URL fragment hashes.
 * @internal
 */
const createHashAdapter = (): UrlAdapter => {
  return {
    getBrowserState: () => {
      const hash = location.hash;
      const raw = hash.startsWith('#') ? hash.substring(1) : hash;
      const { route, query } = PathUtils.split(raw);
      return { path: route, query: parseQueryParams(query ?? ''), url: hash };
    },
    commit: (fullPath) => {
      const { route, query } = PathUtils.split(fullPath);
      const url = `#${query ? `${route}?${query}` : route}`;
      location.hash = url;
      return { path: PathUtils.normalize(route), query: parseQueryParams(query ?? ''), url };
    },
    revert: (previousUrl) => {
      if (location.hash !== previousUrl) {
        location.hash = previousUrl;
      }
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

/** Internal type for compiled route metadata. @internal */
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

/** Internal type for route matching results. @internal */
type MatchResult =
  | {
      readonly kind: 'found';
      readonly route: CompiledRoute;
      readonly params: Record<string, string>;
    }
  | { readonly kind: 'not-found' };

/**
 * Manages path pattern matching and parameter extraction.
 *
 * Logic: Regex Transformation
 * This class converts human-readable path patterns (e.g., `/user/:id`) into
 * anchored regular expressions. It escapes special characters while
 * transforming `:param` tokens into capturing groups for high-performance
 * extraction of named segments.
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

  /** Finds a matching route for the provided path and extracts parameters. */
  match(path: string): MatchResult {
    const normalized = PathUtils.normalize(path);

    for (const route of this.routes) {
      if (route.kind === 'exact') {
        if (route.pattern === normalized) {
          return { kind: 'found', route, params: {} };
        }
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

/**
 * Concrete implementation of the Router interface.
 * @internal
 */
class RouterImpl implements Router {
  public currentRoute: ReadonlyAtom<string>;
  public queryParams: ReadonlyAtom<Record<string, string>>;
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

  /** Normalizes raw configuration into a consistent internal format. */
  private parseConfig(c: RouteConfig) {
    return {
      mode: SYSTEM_ROUTE.DEFAULTS.mode,
      basePath: SYSTEM_ROUTE.DEFAULTS.basePath,
      autoBindLinks: SYSTEM_ROUTE.DEFAULTS.autoBindLinks,
      activeClass: SYSTEM_ROUTE.DEFAULTS.activeClass,
      notFound: c.notFound ?? '',
      beforeTransition: c.beforeTransition ?? (() => {}),
      afterTransition: c.afterTransition ?? (() => {}),
      default: c.default ?? '',
      ...c,
      routes: c.routes ?? {},
    } as Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  }

  /** Establishes core reactive effects and event listeners. */
  private setupLifecycle() {
    this.cleanups.push(this.urlAdapter.setupListener(() => this.handleBrowserSync()));

    const renderSub = effect(() => {
      const path = this.currentRouteAtom.value;
      this.queryParamsAtom.value;

      untracked(() => {
        this.runRouteCleanups();
        this.render(path);
      });
    });
    this.cleanups.push(() => renderSub.dispose());

    if (this.config.autoBindLinks) {
      this.setupInterception();
    }
    if (this.$target[0]) {
      registry.onCleanup(this.$target[0], () => this.destroy());
    }
  }

  /**
   * Programmatically navigates to a new path.
   *
   * Logic: Navigation Guard
   * The transition is intercepted to execute the `onLeave` guard. If the
   * guard returns `false`, the navigation is aborted. This is typically
   * used to prevent data loss in unsaved forms.
   *
   * @param path - The target path including optional query strings.
   */
  public navigate(path: string): void {
    if (this.isDestroyed || !this.canLeave()) {
      return;
    }

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

  /** Synchronizes the internal state with external browser-driven URL changes. */
  private handleBrowserSync() {
    if (this.isDestroyed) return;
    const state = this.urlAdapter.getBrowserState();
    if (state.url === this.previousUrl) return;

    const nextPath = state.path || this.config.default;
    if (this.currentRouteAtom.peek() !== nextPath) {
      if (!this.canLeave()) {
        // Reason: Force the browser URL back if the current route transition is blocked.
        this.urlAdapter.revert(this.previousUrl);
        return;
      }
      this.currentRouteAtom.value = nextPath;
    }

    this.queryParamsAtom.value = state.query;
    this.previousUrl = state.url;
  }

  /**
   * Orchestrates the rendering process for a given path.
   *
   * Lifecycle: Transition Stages
   * 1. Global Pre-hook: `beforeTransition` execution.
   * 2. Local Guard: `onEnter` execution with parameter pre-processing.
   * 3. DOM Sync: UI rendering via templates or render callbacks.
   * 4. Global Post-hook: `afterTransition` execution.
   * 5. Finalization: Focus management and accessibility updates.
   */
  private render(requestedPath: string): void {
    const matchResult = this.matcher.match(requestedPath);
    const def =
      matchResult.kind === 'found'
        ? matchResult.route.def
        : this.config.routes[this.config.notFound];

    if (!def) {
      debug.warn(SYSTEM_ROUTE.PREFIX, SYSTEM_ROUTE.ERRORS.NOT_FOUND(requestedPath));
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
      if (hookResult) {
        Object.assign(mergedParams, hookResult);
      }
    }

    if (!PathUtils.isSameParams(this.paramsAtom.peek(), mergedParams)) {
      this.paramsAtom.value = mergedParams;
    }

    if (def.title) {
      document.title = def.title;
    }
    this.updateDom(def, routeName, mergedParams);

    untracked(() => this.config.afterTransition(this.previousPath, routeName));
    this.finalizeNavigation(routeName, mergedParams);
  }

  /** Applies the route definition to the target DOM container. */
  private updateDom(def: RouteDefinition, name: string, params: Record<string, string>) {
    const container = this.$target[0];
    if (!container) return;

    // Logic: The container is cleared entirely before new content is injected.
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

    this.checkUnregisteredComponents(container);
  }

  /** Checks for unregistered custom elements within the container and logs a warning in debug mode. */
  private checkUnregisteredComponents(container: HTMLElement) {
    if (!debug.enabled || typeof customElements === 'undefined') return;

    container.querySelectorAll(':not(:defined)').forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      // Logic: Standard Custom Elements must contain a hyphen.
      if (tagName.includes('-')) {
        debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
      }
    });
  }

  /** Automatically scans the DOM for templates with route definitions. */
  private discoverRoutesFromDOM() {
    document.querySelectorAll<HTMLTemplateElement>('template[data-path]').forEach((tmpl) => {
      const path = PathUtils.normalize(tmpl.getAttribute('data-path') ?? '');
      const title = tmpl.getAttribute('title') ?? tmpl.getAttribute('data-title');

      const existing = this.config.routes[path];
      if (!existing) {
        if (!tmpl.id) {
          tmpl.id = `route-${Math.random().toString(36).substring(2, 9)}`;
        }
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

  /** Establishes global click interception for routing. */
  private setupInterception() {
    const onClick = (e: JQuery.TriggeredEvent) => {
      const me = e.originalEvent as MouseEvent;
      if (me && (me.ctrlKey || me.metaKey || me.altKey || me.shiftKey || me.button !== 0)) {
        return;
      }

      const el = e.currentTarget as HTMLElement;
      if (el.hasAttribute('data-ignore')) {
        return;
      }

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

  /** Manages visual feedback for active links via CSS classes and ARIA attributes. */
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

          // Accessibility: Signal active navigation state for screen readers.
          if (active) {
            el.setAttribute('aria-current', 'page');
          } else {
            el.removeAttribute('aria-current');
          }
        });
      });
    });
    this.cleanups.push(() => activeSub.dispose());
  }

  /** Resolves the navigation path from an element's attributes. */
  private resolvePathFromElement(el: HTMLElement, stripQuery = false): string {
    let path = el.dataset.route ?? '';
    if (!path && el instanceof HTMLAnchorElement) {
      path = this.urlAdapter.resolveAnchor(el);
    }
    return stripQuery ? PathUtils.split(path).route : path;
  }

  /**
   * Evaluates whether a specific link click should be intercepted by the router.
   *
   * Logic: Interception Policy
   * Bypasses interception for:
   * - External domains or elements with `rel="external"`.
   * - Files with extensions (e.g., `.pdf`) unless an explicit route exists.
   * - Modified clicks (Ctrl/Cmd) to maintain native tab behavior.
   */
  private shouldIntercept(path: string, el: HTMLElement): boolean {
    if (el instanceof HTMLAnchorElement) {
      if (
        el.rel === 'external' ||
        (el.target && el.target !== '_self') ||
        el.hasAttribute('download')
      ) {
        return false;
      }
      if (el.origin !== location.origin) {
        return false;
      }

      // Logic: Ignore file paths (e.g., .jpg) that don't match a registered route.
      const last = path.split('/').pop() ?? '';
      if (
        last.includes('.') &&
        this.matcher.match(PathUtils.split(path).route).kind === 'not-found'
      ) {
        return false;
      }
    }
    const { route } = PathUtils.split(path);
    return this.matcher.match(route).kind === 'found' || !!this.config.notFound;
  }

  /** Evaluates if the current route can be abandoned based on guards. */
  private canLeave(): boolean {
    const matchResult = this.matcher.match(this.currentRouteAtom.peek());
    const def =
      matchResult.kind === 'found'
        ? matchResult.route.def
        : this.config.routes[this.config.notFound];
    return def?.onLeave ? untracked(() => def.onLeave!(this)) !== false : true;
  }

  /** Retrieves a template element from the DOM. */
  private getTemplate(selector: string) {
    const el = document.querySelector(selector);
    return el instanceof HTMLTemplateElement ? el : null;
  }

  /** Executes all registered cleanup tasks for the previous route. */
  private runRouteCleanups() {
    this.routeCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.routeCleanups = [];
  }

  /**
   * Finalizes the navigation by updating accessibility state and firing events.
   *
   * Accessibility: SPA Focus Management
   * To ensure screen readers announce new content, the document focus is reset
   * to the main heading (`h1`) or the target container. This prevents the
   * browser from remaining silent on the triggering link.
   */
  private finalizeNavigation(routeName: string, params: Record<string, string>) {
    window.dispatchEvent(
      new CustomEvent('route-change', {
        detail: { from: this.previousPath, to: routeName, params },
      })
    );

    const targetElement = this.$target[0];
    if (!targetElement) return;

    const heading = targetElement.querySelector('h1, [role="heading"]');
    const focusTarget = heading instanceof HTMLElement ? heading : targetElement;
    focusTarget.tabIndex = -1;
    focusTarget.focus();

    this.previousPath = routeName;
  }

  /**
   * Disposes of the router and all associated reactive resources.
   * @internal
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
  }
}

/**
 * Initializes a reactive router for synchronizing URL state with DOM views.
 *
 * Logic: Reactive Routing
 * This manager orchestrates URL synchronization, path matching, and dynamic
 * view rendering. It utilizes atoms to provide reactive access to
 * `currentRoute` and `params`, enabling secondary UI elements (like
 * breadcrumbs) to synchronize effortlessly.
 *
 * Capabilities:
 * - Multi-mode support: 'history' (pushState) or 'hash' for legacy environments.
 * - Dynamic matching: High-performance parameter extraction for named segments.
 * - Lifecycle hooks: Fine-grained navigation control via `onEnter` and `onLeave` guards.
 * - Accessibility: Built-in SPA focus management for screen readers.
 *
 * @param config - Configuration for routes, containers, and lifecycle hooks.
 * @returns A router interface for programmatic control and state monitoring.
 *
 * @example
 * ```typescript
 * const router = $.route({
 *   target: '#app-root',
 *   routes: {
 *     '/': { template: '#home-tmpl' },
 *     '/user/:id': {
 *       render: (el, name, params) => {
 *         $(el).text(`User ID: ${params.id}`);
 *       }
 *     }
 *   }
 * });
 * ```
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

$.extend({ route });
