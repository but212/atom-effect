import {
  batch,
  computed,
  atom as createAtom,
  effect,
  type ReadonlyAtom,
  untracked,
} from '@but212/atom-effect';
import { Option, Result, SlotBuffer } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_ROUTE } from '@/constants';
import { navCoordinator, normalizePath, parseQuery, splitPath } from '@/core/navigation';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, RouteLocation, Router, WritableAtom } from '@/types';
import { shallowEqual } from '@/utils';
import { debug } from '@/utils/debug';
import {
  createAdapter,
  createRouteMatcher,
  type RouteMatcher,
  resolveNavigation,
  resolveRoute,
} from './core';
import {
  createRouteRenderer,
  createRouteScanner,
  discoverRoutes,
  type RouteRenderer,
  type RouteScanner,
  renderRoute,
  runRendererCleanups,
  setupRouteInterceptor,
  setupRouteScanner,
} from './view';

/**
 * Concrete implementation of the Router interface.
 * Coordinates the transition from URL intent to rendered view.
 */
export class RouterImpl implements Router {
  public readonly location: ReadonlyAtom<RouteLocation>;
  public readonly currentRoute: ReadonlyAtom<string>;
  public readonly queryParams: ReadonlyAtom<Record<string, string>>;
  public readonly params: ReadonlyAtom<Record<string, string>>;

  private readonly matcher: RouteMatcher;
  private readonly config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  private readonly urlAdapter: ReturnType<typeof createAdapter>;
  private readonly $target: JQuery<HTMLElement>;

  private readonly scanner: RouteScanner;
  private readonly renderer: RouteRenderer;

  private readonly currentRouteAtom: WritableAtom<string>;
  private readonly queryParamsAtom: WritableAtom<Record<string, string>>;
  private readonly paramsAtom: WritableAtom<Record<string, string>>;

  /**
   * Logic: Internal State Management
   * Tracks transient flags and metadata that are hidden from the public API
   * to ensure stable transitions and prevent feedback loops.
   */
  private readonly stateAtom = createAtom({
    isDestroyed: false,
    isTransitioning: false,
    previousUrl: '',
    currentDef: undefined as RouteDefinition | undefined,
  });

  private readonly cleanups = new SlotBuffer<() => void>();

  /**
   * The public context object passed to route guards and lifecycle hooks.
   * Defined as a separate object to maintain interface compatibility.
   */
  private readonly context: Router = {
    currentRoute: computed(() => this.currentRouteAtom.value),
    queryParams: computed(() => this.queryParamsAtom.value),
    params: computed(() => this.paramsAtom.value),
    location: computed(() => ({
      path: this.currentRouteAtom.value,
      query: this.queryParamsAtom.value,
      params: this.paramsAtom.value,
    })),
    navigate: (p) => this.navigate(p),
    destroy: () => this.destroy(),
  };

  constructor(config: RouteConfig) {
    this.config = {
      mode: SYSTEM_ROUTE.DEFAULTS.mode,
      basePath: SYSTEM_ROUTE.DEFAULTS.basePath,
      autoBindLinks: SYSTEM_ROUTE.DEFAULTS.autoBindLinks,
      activeClass: SYSTEM_ROUTE.DEFAULTS.activeClass,
      notFound: config.notFound ?? '',
      beforeTransition: config.beforeTransition ?? (() => {}),
      afterTransition: config.afterTransition ?? (() => {}),
      ...config,
      routes: config.routes ?? {},
    } as Required<RouteConfig> & { routes: Record<string, RouteDefinition> };

    const t = this.config.target;
    this.$target =
      typeof t === 'string' ? $(t) : t instanceof HTMLElement ? $(t) : (t as JQuery<HTMLElement>);
    this.urlAdapter = createAdapter(this.config.mode, this.config.basePath);

    const discovery = discoverRoutes();

    // Logic: Manifest Supplement
    // Merges declarative template-based routes with explicit JS configuration.
    // Preserves metadata (like titles) from templates unless overridden in JS.
    for (const path in discovery.routes) {
      const discovered = discovery.routes[path]!;
      if (this.config.routes[path]) {
        const userDef = this.config.routes[path]!;
        if (!userDef.title && discovered.title) userDef.title = discovered.title;
        if (!userDef.template && discovered.template) userDef.template = discovered.template;
      } else {
        this.config.routes[path] = discovered;
      }
    }
    if (this.config.default === undefined) this.config.default = discovery.default ?? '';

    this.matcher = createRouteMatcher(this.config.routes);
    this.scanner = createRouteScanner(
      this.config,
      this.matcher,
      this.urlAdapter,
      this.config.activeClass
    );
    this.renderer = createRouteRenderer(this.$target, this.config, this.urlAdapter);

    const initState = this.urlAdapter.get();
    this.stateAtom.value = { ...this.stateAtom.peek(), previousUrl: initState.url };

    const resolved = resolveNavigation(
      this.matcher,
      this.config,
      normalizePath(initState.path),
      initState.query,
      this.context
    );

    const initial = resolved.success
      ? resolved
      : { path: this.config.default, query: {}, params: {} };

    this.currentRouteAtom = createAtom(initial.path!);
    this.currentRoute = this.currentRouteAtom;

    this.queryParamsAtom = createAtom(initial.query!);
    this.queryParams = computed(() => this.queryParamsAtom.value);

    this.paramsAtom = createAtom(initial.params!);
    this.params = this.paramsAtom;

    this.location = computed(() => ({
      path: this.currentRouteAtom.value,
      query: this.queryParamsAtom.value,
      params: this.paramsAtom.value,
    }));

    this.setupLifecycle();
  }

  /**
   * Logic: Lifecycle Orchestration
   * Establishes the reactive bridge between the URL adapter and the renderer.
   */
  private setupLifecycle() {
    this.cleanups.push(this.urlAdapter.setupListener(() => this.handleBrowserSync()));

    const renderSub = effect(() => {
      // Logic: Rendering Trigger
      // We explicitly untrack the rendering logic to prevent the renderer
      // from becoming a dependency of its own DOM-cleaning side effects.
      const path = this.currentRouteAtom.value;

      untracked(() => {
        runRendererCleanups(this.renderer);
        this.render(path);
      });
    });
    this.cleanups.push(() => renderSub.dispose());

    const { resolvePath } = setupRouteScanner(this.scanner, this.currentRoute);
    this.cleanups.push(() => this.scanner.linkObserver?.disconnect());

    if (this.config.autoBindLinks) {
      this.cleanups.push(
        setupRouteInterceptor(this.config, this.matcher, resolvePath, (p) => this.navigate(p))
      );
    }

    // Constraint: Automatic Teardown
    // Binds the router lifecycle to the target element's DOM presence.
    if (this.$target[0]) {
      navCoordinator.register(this.$target[0], 'router', () => this.canLeave());
      registry.onCleanup(this.$target[0], () => this.destroy());
    }
  }

  private updateState(
    nextPath: string,
    nextQuery: Record<string, string>,
    params: Record<string, string>
  ) {
    batch(() => {
      if (!shallowEqual(this.paramsAtom.peek(), params)) this.paramsAtom.value = params;
      if (!shallowEqual(this.queryParamsAtom.peek(), nextQuery))
        this.queryParamsAtom.value = nextQuery;
      if (this.currentRouteAtom.peek() !== nextPath) this.currentRouteAtom.value = nextPath;
    });
  }

  /**
   * Programmatically transitions the application to a new location.
   *
   * When to use:
   * - Triggered by user clicks or script-driven navigation logic.
   *
   * Caution:
   * - Navigation will be aborted if the current route's `onLeave` guard returns `false`.
   *
   * @example
   * router.navigate('/user/123', { debug: 'true' });
   */
  public async navigate(
    to: string | Partial<RouteLocation>,
    query: Record<string, string> = {}
  ): Promise<void> {
    const state = this.stateAtom.peek();
    if (state.isDestroyed || !this.canLeave()) return;

    let targetPath: string;
    let targetQuery: Record<string, string> = query;

    if (typeof to === 'string') {
      const { route: routePart, query: queryPart } = splitPath(to);
      targetPath = routePart || this.config.default;
      if (Option.isSome(queryPart)) {
        targetQuery = { ...parseQuery(Option.unwrap(queryPart)), ...query };
      }
    } else {
      targetPath = to.path || this.currentRouteAtom.peek();
      targetQuery = { ...to.query, ...query };
    }

    if (!targetPath) return;

    const queryString = new URLSearchParams(targetQuery).toString();
    const fullPath = queryString ? `${targetPath}?${queryString}` : targetPath;

    // Logic: Transition Guard
    // Setting `isTransitioning` prevents `handleBrowserSync` from reacting
    // to the URL change we are about to trigger manually.
    this.stateAtom.value = { ...state, isTransitioning: true };
    try {
      const nextState = this.urlAdapter.commit(fullPath);
      const resolved = resolveNavigation(
        this.matcher,
        this.config,
        nextState.path,
        nextState.query,
        this.context
      );
      if (resolved.success) {
        this.updateState(resolved.path!, resolved.query!, resolved.params!);
      } else {
        // Revert: Navigation rejected by an 'onEnter' guard.
        this.urlAdapter.revert(state.previousUrl);
      }
    } finally {
      this.stateAtom.value = { ...this.stateAtom.peek(), isTransitioning: false };
    }
  }

  /**
   * Logic: Browser State Synchronization
   * Handles external URL changes (e.g., Back/Forward button) and ensures
   * they are validated against route guards before adoption.
   */
  private handleBrowserSync() {
    const state = this.stateAtom.peek();
    if (state.isDestroyed || state.isTransitioning) return;

    const adapterState = this.urlAdapter.get();
    if (adapterState.url === state.previousUrl) return;

    // Constraint: Guard Enforcement
    // If the current view refuses to unmount, we force the browser URL back to the previous state.
    if (!this.canLeave()) {
      this.stateAtom.value = { ...state, isTransitioning: true };
      try {
        this.urlAdapter.revert(state.previousUrl);
      } finally {
        this.stateAtom.value = { ...this.stateAtom.peek(), isTransitioning: false };
      }
      return;
    }

    const resolved = resolveNavigation(
      this.matcher,
      this.config,
      normalizePath(adapterState.path),
      adapterState.query,
      this.context
    );

    batch(() => {
      if (resolved.success) {
        this.updateState(resolved.path!, resolved.query!, resolved.params!);
      } else {
        // Guard failure on browser-initiated navigation (Back/Forward).
        this.stateAtom.value = { ...state, isTransitioning: true };
        try {
          this.urlAdapter.revert(state.previousUrl);
        } finally {
          this.stateAtom.value = { ...this.stateAtom.peek(), isTransitioning: false };
        }
      }
    });
  }

  /**
   * Logic: Internal Rendering Dispatch
   * Resolves the route definition and delegates DOM manipulation to the renderer.
   */
  private render(requestedPath: string): void {
    const { def, pattern: routeName } = resolveRoute(
      this.matcher,
      requestedPath,
      this.config.routes,
      this.config.notFound
    );

    if (!def) {
      debug.warn(SYSTEM_ROUTE.PREFIX, SYSTEM_ROUTE.ERRORS.NOT_FOUND(requestedPath));
      return;
    }

    this.stateAtom.value = {
      ...this.stateAtom.peek(),
      currentDef: def,
      previousUrl: this.urlAdapter.get().url,
    };
    renderRoute(this.renderer, def, routeName, this.paramsAtom.peek(), this.context);
  }

  /**
   * Executes the unmount guard for the current route.
   */
  private canLeave(): boolean {
    const state = this.stateAtom.peek();
    const def = state.currentDef || this.config.routes[this.config.notFound];
    return def?.onLeave ? untracked(() => def.onLeave!(this.context)) !== false : true;
  }

  /**
   * Cleanup: Resource Disposal
   * Terminates all reactive effects, unbinds global listeners, and releases DOM references.
   */
  public destroy(): void {
    const state = this.stateAtom.peek();
    if (state.isDestroyed) return;
    this.stateAtom.value = { ...state, isDestroyed: true };
    runRendererCleanups(this.renderer);
    this.cleanups.forEach((fn) => Result.tryCatch(fn));
    this.cleanups.dispose();
  }
}
