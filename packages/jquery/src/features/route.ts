import {
  batch,
  computed,
  atom as createAtom,
  effect,
  type ReadonlyAtom,
  untracked,
} from '@but212/atom-effect';
import { Option, Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_COMPONENT, SYSTEM_ROUTE } from '@/constants';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, Router, WritableAtom } from '@/types';
import { shallowEqual } from '@/utils';
import { debug } from '@/utils/debug';

/**
 * Collection of internal path manipulation utilities.
 * @internal
 */
const PathUtils = {
  /** Removes leading and trailing slashes from a path. */
  normalize: (path: string): string => path.replace(/(^\/+|\/+$)/g, ''),

  /** Separates a path into its route and query string components. */
  split: (path: string): { route: string; query: Option<string> } => {
    const [route, query] = path.split('?');
    return { route: PathUtils.normalize(route ?? ''), query: Option.fromNullable(query) };
  },
};

/**
 * Parses a raw query string into a key-value record.
 * URLSearchParams (ES2019) handles '?' prefix and percent-decoding natively.
 * @internal
 */
const parseQuery = (raw: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(raw));

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
        query: parseQuery(location.search.substring(1)),
        url: location.pathname + location.search,
      };
    },
    commit: (fullPath) => {
      const { route, query } = PathUtils.split(fullPath);
      const url = new URL(route, absoluteBase);
      Option.map(query, (q) => {
        url.search = q;
      });
      const urlStr = url.pathname + url.search;
      Result.tryCatch(() => history.pushState(null, '', urlStr));

      return {
        path: PathUtils.normalize(route),
        // Reuse the already-parsed URL object — no second parse needed.
        query: Object.fromEntries(url.searchParams),
        url: urlStr,
      };
    },
    revert: (previousUrl) => {
      const current = location.pathname + location.search;
      if (current !== previousUrl) {
        Result.tryCatch(() => history.replaceState(null, '', previousUrl));
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
      // URL spec: location.hash is always '' or '#...' — conditional branch unneeded.
      const raw = location.hash.slice(1);
      const { route, query } = PathUtils.split(raw);
      return {
        path: route,
        query: parseQuery(Option.unwrapOr(query, '')),
        url: location.hash,
      };
    },
    commit: (fullPath) => {
      const { route, query } = PathUtils.split(fullPath);
      const url = `#${Option.isSome(query) ? `${route}?${Option.unwrap(query)}` : route}`;
      location.hash = url;
      return {
        path: PathUtils.normalize(route),
        query: parseQuery(Option.unwrapOr(query, '')),
        url,
      };
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
      // URLPattern branch: Chrome 95+, Edge 95+, Safari 17+.
      // Handles :param extraction and percent-decoding natively.
      readonly kind: 'url-pattern';
      readonly pattern: string;
      readonly urlPattern: URLPattern;
      readonly def: RouteDefinition;
    }
  | {
      // Regex fallback for browsers without URLPattern (e.g. Firefox).
      readonly kind: 'dynamic';
      readonly pattern: string;
      readonly regex: RegExp;
      readonly paramNames: readonly string[];
      readonly def: RouteDefinition;
    };

/** Internal type for route matching results. @internal */
type MatchResult = Option<{
  readonly route: CompiledRoute;
  readonly params: Record<string, string>;
}>;

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
      } else if (typeof URLPattern !== 'undefined') {
        // URLPattern resolves :param groups and decodes percent-encoding natively.
        this.routes.push({
          kind: 'url-pattern',
          pattern: normalized,
          urlPattern: new URLPattern({ pathname: `/${normalized}` }),
          def,
        });
      } else {
        // Regex fallback for environments without URLPattern (e.g. Firefox).
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
          return Option.some({ route, params: {} });
        }
      } else if (route.kind === 'url-pattern') {
        const resultOpt = Option.fromNullable(
          route.urlPattern.exec({ pathname: `/${normalized}` })
        );
        if (Option.isSome(resultOpt)) {
          const result = Option.unwrap(resultOpt);
          const params = Object.fromEntries(
            Object.entries(result.pathname.groups).filter(
              (entry): entry is [string, string] => entry[1] != null
            )
          );
          return Option.some({ route, params });
        }
      } else {
        const matchOpt = Option.fromNullable(normalized.match(route.regex));
        if (Option.isSome(matchOpt)) {
          const match = Option.unwrap(matchOpt);
          const params = route.paramNames.reduce(
            (acc, name, i) => {
              const val = match[i + 1] || '';
              const decoded = Result.tryCatch(() => decodeURIComponent(val));
              acc[name] = Result.match(decoded, {
                ok: (v) => v,
                err: () => val,
              });
              return acc;
            },
            {} as Record<string, string>
          );
          return Option.some({ route, params });
        }
      }
    }
    return Option.none;
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

    // Resolve target to a JQuery instance while satisfying TypeScript's overload resolution
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
    const initialParams = Option.unwrapOr(
      Option.map(firstMatch, (m) => m.params),
      {}
    );
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

    // Initialize automatic link discovery and tracking
    this.scanLinks();
    this.linkObserver = this.setupLinkObserver();

    if (this.$target[0]) {
      registry.onCleanup(this.$target[0], () => this.destroy());
    }
  }

  /** Unified state update mechanism with batching to prevent redundant renders. */
  private updateState(nextPath: string, nextQuery: Record<string, string>, newUrl: string) {
    batch(() => {
      if (!shallowEqual(this.queryParamsAtom.peek(), nextQuery)) {
        this.queryParamsAtom.value = nextQuery;
      }
      if (this.currentRouteAtom.peek() !== nextPath) {
        this.currentRouteAtom.value = nextPath;
      }
    });
    this.previousUrl = newUrl;
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

    const fullPath = Option.match(query, {
      some: (q) => `${targetPath}?${q}`,
      none: () => targetPath,
    });
    const nextState = this.urlAdapter.commit(fullPath);

    this.updateState(nextState.path, nextState.query, nextState.url);
  }

  /** Synchronizes the internal state with external browser-driven URL changes. */
  private handleBrowserSync() {
    if (this.isDestroyed) return;

    const state = this.urlAdapter.getBrowserState();
    if (state.url === this.previousUrl) return;

    const nextPath = state.path || this.config.default;

    if (this.currentRouteAtom.peek() !== nextPath && !this.canLeave()) {
      // Reason: Force the browser URL back if the current route transition is blocked.
      this.urlAdapter.revert(this.previousUrl);
      return;
    }

    this.updateState(nextPath, state.query, state.url);
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
    const def = Option.unwrapOr(
      Option.map(matchResult, (m) => m.route.def),
      this.config.routes[this.config.notFound]
    );

    if (!def) {
      debug.warn(SYSTEM_ROUTE.PREFIX, SYSTEM_ROUTE.ERRORS.NOT_FOUND(requestedPath));
      return;
    }

    const routeName = Option.unwrapOr(
      Option.map(matchResult, (m) => m.route.pattern),
      requestedPath
    );
    const pathParams = Option.unwrapOr(
      Option.map(matchResult, (m) => m.params),
      {}
    );
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

    if (!shallowEqual(this.paramsAtom.peek(), mergedParams)) {
      this.paramsAtom.value = mergedParams;
    }

    if (def.title) {
      document.title = def.title;
    }
    this.updateDom(def, routeName, mergedParams);

    this.syncActiveLinks(routeName);
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
          // Logic: Unique Identifier Generation
          // Uses standard crypto.randomUUID() (ES2021+) with a fallback for older environments.
          const uuid =
            typeof crypto?.randomUUID === 'function'
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2, 11);
          tmpl.id = `route-${uuid}`;
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
  }

  private readonly trackedLinks = new Set<Element>();
  private linkObserver!: MutationObserver;

  /** Synchronizes visual feedback for active links via CSS classes and ARIA attributes. */
  private syncActiveLinks(current: string) {
    const matchResult = this.matcher.match(current);
    const pattern = Option.unwrapOr(
      Option.map(matchResult, (m) => m.route.pattern),
      ''
    );

    for (const el of this.trackedLinks) {
      this.updateActiveStateForLink(el, current, pattern);
    }
  }

  /** Updates the active visual state for a specific link element. */
  private updateActiveStateForLink(el: Element, current: string, pattern: string) {
    const path = this.resolvePathFromElement(el, true);
    const active = path === current || path === pattern;

    if (active) {
      el.classList.add(this.activeClass);
      el.setAttribute('aria-current', 'page');
    } else {
      el.classList.remove(this.activeClass);
      el.removeAttribute('aria-current');
    }
  }

  /** Scans the document for navigation links and adds them to the tracked set. */
  private scanLinks() {
    document.querySelectorAll<HTMLElement>('a, [data-route]').forEach((el) => {
      this.trackLink(el);
    });
  }

  /** Registers a single element for active state tracking. */
  private trackLink(el: Element) {
    if (this.trackedLinks.has(el)) return;
    this.trackedLinks.add(el);

    // Logic: Immediate Synchronization
    // New links must be updated immediately to match the current route state.
    const current = this.currentRoute.peek();
    const matchResult = this.matcher.match(current);
    const pattern = Option.unwrapOr(
      Option.map(matchResult, (m) => m.route.pattern),
      ''
    );
    this.updateActiveStateForLink(el, current, pattern);

    // Registry manages weak tracking safely without namespace restrictions
    registry.onCleanup(el, () => this.trackedLinks.delete(el));
  }

  /** Initializes a mutation observer to detect and track navigation links. @internal */
  private setupLinkObserver(): MutationObserver {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const el = node as Element;
            const isLink = el.localName === 'a' || el.hasAttribute('data-route');
            if (isLink) {
              this.trackLink(el);
            }
            el.querySelectorAll?.('a, [data-route]').forEach((child) => {
              this.trackLink(child);
            });
          }
        });
      }
    });

    const root = document.body || document.documentElement;
    observer.observe(root, { childList: true, subtree: true });
    return observer;
  }

  /** Resolves the navigation path from an element's attributes. */
  private resolvePathFromElement(el: Element, stripQuery = false): string {
    // Logic: Attribute Priority
    // data-route takes precedence. If present but empty on an anchor, we fallback to href.
    let path = el.getAttribute('data-route');

    if (!path && el.localName === 'a') {
      if (el instanceof HTMLAnchorElement) {
        path = this.urlAdapter.resolveAnchor(el);
      } else {
        // SVG Anchor handling leverages the URL adapter via temporary anchor
        const rawHref = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        if (rawHref.startsWith('#')) {
          path = rawHref.slice(1);
        } else {
          const tempAnchor = document.createElement('a');
          tempAnchor.href = rawHref;
          path = this.urlAdapter.resolveAnchor(tempAnchor);
        }
      }
    }

    const finalPath = path || '';
    return stripQuery ? PathUtils.split(finalPath).route : finalPath;
  }

  /** Evaluates whether a specific link click should be intercepted by the router. */
  private shouldIntercept(path: string, el: Element): boolean {
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
      if (last.includes('.') && Option.isNone(this.matcher.match(PathUtils.split(path).route))) {
        return false;
      }
    }
    const { route } = PathUtils.split(path);
    return Option.isSome(this.matcher.match(route)) || !!this.config.notFound;
  }

  /** Evaluates if the current route can be abandoned based on guards. */
  private canLeave(): boolean {
    const matchResult = this.matcher.match(this.currentRouteAtom.peek());
    const def = Option.unwrapOr(
      Option.map(matchResult, (m) => m.route.def),
      this.config.routes[this.config.notFound]
    );
    return def?.onLeave ? untracked(() => def.onLeave!(this)) !== false : true;
  }

  /** Retrieves a template element from the DOM. */
  private getTemplate(selector: string) {
    const el = document.querySelector(selector);
    return el instanceof HTMLTemplateElement ? el : null;
  }

  /** Executes all registered cleanup tasks for the previous route. */
  private runRouteCleanups() {
    this.routeCleanups.forEach((fn) => Result.tryCatch(fn));
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
    this.linkObserver?.disconnect();
    this.trackedLinks.clear();
    this.cleanups.forEach((fn) => Result.tryCatch(fn));
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
