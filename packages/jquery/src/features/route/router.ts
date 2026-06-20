/**
 * @module AEJRouter
 *
 * Responsibility:
 * Central coordination of the routing lifecycle, managing URL state
 * synchronization, route guard execution, and reactive view transitions.
 */

import {
  batch,
  computed,
  atom as createAtom,
  effect,
  type ReadonlyAtom,
  untracked,
} from '@but212/atom-effect';
import { Result, SlotBuffer, shallowEqual } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_ROUTE } from '@/constants';
import { navCoordinator, normalizePath, parseQuery, splitPath } from '@/core/navigation';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, RouteLocation, Router, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import {
  createAdapter,
  createRouteMatcher,
  type RouteMatcher,
  resolveNavigation,
  resolveRoute,
} from './core';
import type { UrlAdapter } from './types';
import {
  createRouteRenderer,
  discoverRoutes,
  type RouteRenderer,
  renderRoute,
  runRendererCleanups,
  setupRouteInterceptor,
  setupRouteScanner,
} from './view';

/**
 * Logic: Central Navigation Authority
 * Coordinates the transition from URL intent to rendered view by
 * orchestrating the matcher, adapter, and renderer.
 */
export class RouterImpl implements Router {
  public readonly location: ReadonlyAtom<RouteLocation>;
  public readonly currentRoute: ReadonlyAtom<string>;
  public readonly queryParams: ReadonlyAtom<Record<string, string>>;
  public readonly params: ReadonlyAtom<Record<string, string>>;

  readonly #matcher: RouteMatcher;
  readonly #config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  readonly #urlAdapter: UrlAdapter;
  readonly #$target: JQuery<HTMLElement>;

  readonly #renderer: RouteRenderer;

  readonly #locationAtom: WritableAtom<RouteLocation>;

  /**
   * Logic: Internal State Management
   * Transient flags and metadata managed natively to avoid Atom overhead
   * for strictly internal, non-reactive transitions.
   */
  #isDestroyed = false;
  #isTransitioning = false;
  #previousUrl = '';
  #currentDef: RouteDefinition | undefined;

  readonly #cleanups = new SlotBuffer<() => void>();

  /**
   * Logic: Manifest Merging & Bootstrapping
   * Initializes the router by merging declarative HTML templates with
   * explicit JS configuration and resolving the initial location.
   */
  constructor(config: RouteConfig) {
    this.#config = {
      mode: SYSTEM_ROUTE.DEFAULTS.mode,
      basePath: SYSTEM_ROUTE.DEFAULTS.basePath,
      autoBindLinks: SYSTEM_ROUTE.DEFAULTS.autoBindLinks,
      activeClass: SYSTEM_ROUTE.DEFAULTS.activeClass,
      notFound: config.notFound ?? '',
      beforeTransition: config.beforeTransition ?? (() => {}),
      afterTransition: config.afterTransition ?? (() => {}),
      ...config,
      routes: { ...config.routes },
    } as Required<RouteConfig> & { routes: Record<string, RouteDefinition> };

    const targetOption = this.#config.target;
    this.#$target =
      typeof targetOption === 'string'
        ? $(targetOption)
        : targetOption instanceof HTMLElement
          ? $(targetOption)
          : (targetOption as JQuery<HTMLElement>);
    this.#urlAdapter = createAdapter(this.#config.mode, this.#config.basePath);

    const discovery = discoverRoutes();

    for (const [path, discovered] of Object.entries(discovery.routes)) {
      const userRouteDefinition = this.#config.routes[path];
      if (userRouteDefinition) {
        if (discovered.title !== undefined) userRouteDefinition.title ||= discovered.title;
        if (discovered.template !== undefined) userRouteDefinition.template ||= discovered.template;
      } else {
        this.#config.routes[path] = discovered;
      }
    }
    this.#config.default ??= discovery.default ?? '';

    this.#matcher = createRouteMatcher(this.#config.routes);
    this.#renderer = createRouteRenderer(this.#$target, this.#config, this.#urlAdapter);

    const initState = this.#urlAdapter.get();
    this.#previousUrl = initState.url;

    const resolved = resolveNavigation(
      this.#matcher,
      this.#config,
      normalizePath(initState.path),
      initState.query,
      this
    );

    const initial = resolved.success
      ? { path: resolved.path, query: resolved.query, params: resolved.params }
      : { path: this.#config.default, query: {}, params: {} };

    this.#locationAtom = createAtom({
      path: initial.path ?? this.#config.default,
      query: initial.query ?? {},
      params: initial.params ?? {},
    });

    this.location = computed(() => this.#locationAtom.value);
    this.currentRoute = computed(() => this.#locationAtom.value.path);
    this.queryParams = computed(() => this.#locationAtom.value.query);
    this.params = computed(() => this.#locationAtom.value.params);

    this.#setupLifecycle();
  }

  /**
   * Logic: Reactive Lifecycle Bridge
   * Establishes the connection between the URL adapter, link scanner,
   * and view renderer using reactive effects.
   */
  #setupLifecycle() {
    this.#cleanups.push(this.#urlAdapter.setupListener(() => this.#handleBrowserSync()));

    const renderSub = effect(() => {
      // Logic: Rendering Trigger
      // We explicitly untrack the rendering logic to prevent the renderer
      // from becoming a dependency of its own DOM-cleaning side effects.
      const path = this.currentRoute.value;

      untracked(() => {
        runRendererCleanups(this.#renderer);
        this.#render(path);
      });
    });
    this.#cleanups.push(() => renderSub.dispose());

    const scanner = setupRouteScanner(
      this.#matcher,
      this.#urlAdapter,
      this.#config.activeClass,
      this.currentRoute
    );
    this.#cleanups.push(() => scanner.disconnect());

    if (this.#config.autoBindLinks) {
      this.#cleanups.push(
        setupRouteInterceptor(this.#config, this.#matcher, scanner.resolvePath, (targetPath) =>
          this.navigate(targetPath)
        )
      );
    }

    // Constraint: Automatic Teardown
    // Binds the router lifecycle to the target element's DOM presence.
    if (this.#$target[0]) {
      navCoordinator.register(this.#$target[0], 'router', () => this.#canLeave());
      registry.onCleanup(this.#$target[0], () => this.destroy());
    }
  }

  #updateState(
    nextPath: string,
    nextQuery: Record<string, string>,
    params: Record<string, string>
  ) {
    const currentLocation = this.#locationAtom.peek();
    if (
      currentLocation.path !== nextPath ||
      !shallowEqual(currentLocation.query, nextQuery) ||
      !shallowEqual(currentLocation.params, params)
    ) {
      batch(() => {
        this.#locationAtom.value = { path: nextPath, query: nextQuery, params };
      });
    }
  }

  /**
   * Logic: Programmatic Navigation
   * Transitions the application to a new location.
   *
   * When to use:
   * - Triggered by user interactions or script-driven navigation logic.
   *
   * Caution:
   * - Navigation is aborted if the current route's `onLeave` guard
   *   explicitly returns `false`.
   */
  public async navigate(
    to: string | Partial<RouteLocation>,
    query: Record<string, string> = {}
  ): Promise<void> {
    if (this.#isDestroyed || !this.#canLeave()) return;

    let targetPath: string;
    let targetQuery: Record<string, string> = query;

    if (typeof to === 'string') {
      const { route: routePart, query: queryPart } = splitPath(to);
      targetPath = routePart || this.#config.default;
      if (queryPart !== null) {
        targetQuery = { ...parseQuery(queryPart), ...query };
      }
    } else {
      targetPath = to.path || this.currentRoute.peek();
      targetQuery = { ...to.query, ...query };
    }

    if (!targetPath) return;

    const queryString = new URLSearchParams(targetQuery).toString();
    const fullPath = queryString ? `${targetPath}?${queryString}` : targetPath;

    // Logic: Transition Guard
    // Setting `isTransitioning` prevents `handleBrowserSync` from reacting
    // to the URL change we are about to trigger manually.
    this.#isTransitioning = true;
    try {
      const nextState = this.#urlAdapter.commit(fullPath);
      const resolved = resolveNavigation(
        this.#matcher,
        this.#config,
        nextState.path,
        nextState.query,
        this
      );
      if (resolved.success) {
        this.#updateState(resolved.path, resolved.query, resolved.params);
      } else {
        // Revert: Navigation rejected by an 'onEnter' guard.
        this.#urlAdapter.revert(this.#previousUrl);
      }
    } finally {
      this.#isTransitioning = false;
    }
  }

  #revertUrl(previousUrl: string) {
    this.#isTransitioning = true;
    try {
      this.#urlAdapter.revert(previousUrl);
    } finally {
      this.#isTransitioning = false;
    }
  }

  /**
   * Logic: Browser-Initiated Synchronization
   * Handles external URL changes (e.g., Back/Forward button) and validates
   * them against route guards before adoption.
   */
  #handleBrowserSync() {
    if (this.#isDestroyed || this.#isTransitioning) return;

    const adapterState = this.#urlAdapter.get();
    if (adapterState.url === this.#previousUrl) return;

    // Constraint: Guard Enforcement
    // If the current view refuses to unmount, we force the browser URL back to the previous state.
    if (!this.#canLeave()) {
      this.#revertUrl(this.#previousUrl);
      return;
    }

    const resolved = resolveNavigation(
      this.#matcher,
      this.#config,
      normalizePath(adapterState.path),
      adapterState.query,
      this
    );

    if (resolved.success) {
      this.#updateState(resolved.path, resolved.query, resolved.params);
    } else {
      // Guard failure on browser-initiated navigation (Back/Forward).
      this.#revertUrl(this.#previousUrl);
    }
  }

  /**
   * Logic: Rendering Orchestration
   * Resolves the final route definition and delegates DOM manipulation
   * to the renderer.
   */
  #render(requestedPath: string): void {
    const { routeDefinition, pattern: routeName } = resolveRoute(
      this.#matcher,
      requestedPath,
      this.#config.routes,
      this.#config.notFound
    );

    if (!routeDefinition) {
      debug.warn(SYSTEM_ROUTE.PREFIX, SYSTEM_ROUTE.ERRORS.NOT_FOUND(requestedPath));
      return;
    }

    this.#currentDef = routeDefinition;
    this.#previousUrl = this.#urlAdapter.get().url;
    renderRoute(this.#renderer, routeDefinition, routeName, this.params.peek(), this);
  }

  /**
   * Executes the unmount guard for the current route.
   */
  #canLeave(): boolean {
    const routeDefinition = this.#currentDef || this.#config.routes[this.#config.notFound];
    return routeDefinition?.onLeave
      ? untracked(() => routeDefinition.onLeave?.(this)) !== false
      : true;
  }

  /**
   * Logic: Final Resource Teardown
   * Terminates all reactive effects, unbinds global listeners, and
   * releases DOM references and registries.
   */
  public destroy(): void {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    runRendererCleanups(this.#renderer);
    this.#cleanups.forEach((teardown: () => void) => Result.tryCatch(teardown));
    this.#cleanups.dispose();
  }
}
