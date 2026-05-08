import { computed, effect, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { Result, SlotBuffer } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_COMPONENT } from '@/constants';
import {
  isInterceptee,
  isNavigationClick,
  NAV_SPEC,
  navCoordinator,
  normalizePath,
  performScroll,
  splitPath,
  syncMetaData,
  updateActiveState,
} from '@/core/navigation';
import { registry } from '@/core/registry';
import type { RouteConfig, RouteDefinition, Router } from '@/types';
import { debug } from '@/utils/debug';
import { type createAdapter, getRoutePattern, type RouteMatcher } from './core';

type RenderStrategy = (
  container: HTMLElement,
  def: RouteDefinition,
  routeName: string,
  params: Record<string, string>,
  onUnmount: (fn: () => void) => void,
  router: Router
) => void;

/**
 * Logic: Polymorphic Rendering
 * Decouples the view definition from the actual mounting logic.
 * Supports both manual JS rendering and declarative HTML templates.
 */
const RENDER_STRATEGIES: Record<string, RenderStrategy> = {
  render: (container, def, routeName, params, onUnmount, router) => {
    def.render?.(container, routeName, params, onUnmount, router);
  },
  template: (container, def, _, __, onUnmount, router) => {
    if (!def.template) return;
    const tmpl = document.querySelector(def.template);
    if (tmpl instanceof HTMLTemplateElement) {
      container.appendChild(tmpl.content.cloneNode(true));
      def.onMount?.($(container).children(), onUnmount, router);
    }
  },
};

/**
 * State container for a specific routing target.
 */
export interface RouteRenderer {
  $target: JQuery<HTMLElement>;
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  urlAdapter: ReturnType<typeof createAdapter>;
  cleanups: SlotBuffer<() => void>;
  previousPath: string;
}

/**
 * Initializes a renderer state for a target element.
 */
export function createRouteRenderer(
  $target: JQuery<HTMLElement>,
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> },
  urlAdapter: ReturnType<typeof createAdapter>
): RouteRenderer {
  return { $target, config, urlAdapter, cleanups: new SlotBuffer(), previousPath: '' };
}

/**
 * Orchestrates the transition between views within a target container.
 *
 * When to use:
 * - Invoked by the router whenever a route match is confirmed.
 *
 * Logic: View Update Pipeline
 * 1. Synchronizes document metadata (Title/Meta).
 * 2. Clears the container and triggers previous view cleanups.
 * 3. Renders the new content using the defined strategy.
 * 4. Manages focus and scroll for Accessibility compliance.
 *
 * @example
 * renderRoute(renderer, homeDef, '/home', {}, routerInstance);
 */
export function renderRoute(
  renderer: RouteRenderer,
  def: RouteDefinition,
  routeName: string,
  params: Record<string, string>,
  router: Router
) {
  const container = renderer.$target[0];
  if (!container) return;

  untracked(() => renderer.config.beforeTransition(renderer.previousPath, routeName));
  if (def.title) document.title = def.title;
  if (def.meta) syncMetaData(window, def.meta);

  // Logic: DOM Refresh
  // Ensures a clean slate and resets the cleanup buffer for the new view lifecycle.
  container.replaceChildren();
  const onUnmount = (fn: () => void) => renderer.cleanups.push(fn);

  const strategy = def.render ? 'render' : def.template ? 'template' : null;
  const handler = strategy ? RENDER_STRATEGIES[strategy] : null;
  if (handler) {
    handler(container, def, routeName, params, onUnmount, router);
  }

  // Security & DX: Validate that all components in the new view are registered.
  // Prevents "silent failures" where custom elements appear as empty tags.
  if (debug.enabled && typeof customElements !== 'undefined') {
    container.querySelectorAll(':not(:defined)').forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      if (tagName.includes('-')) {
        debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
      }
    });
  }

  untracked(() => renderer.config.afterTransition(renderer.previousPath, routeName));

  window.dispatchEvent(
    new CustomEvent('route-change', {
      detail: { from: renderer.previousPath, to: routeName, params },
    })
  );

  // Constraint: Scroll/Focus Ownership
  // If this renderer is nested within a higher-level navigation component (like atomNav),
  // the parent owns the initial page-load transition concerns.
  const isInitialRender = renderer.previousPath === '';
  const skipScrollAndFocus = isInitialRender && navCoordinator.isNestedIn(container, 'nav');

  if (!skipScrollAndFocus) {
    // Constraint: Accessibility (A11y)
    // Moves focus to the new content to ensure Screen Readers start reading the updated view.
    const focusTarget =
      (container.querySelector('h1, [role="heading"]') as HTMLElement) || container;
    focusTarget.tabIndex = -1;
    focusTarget.focus();
  }

  renderer.previousPath = routeName;

  if (!skipScrollAndFocus) {
    if (location.hash) performScroll(window, location.hash.substring(1));
    else window.scrollTo(0, 0);
  }
}

/**
 * Disposes of all resources and effects bound to the current route view.
 */
export function runRendererCleanups(renderer: RouteRenderer) {
  renderer.cleanups.forEach((fn) => Result.tryCatch(fn));
  renderer.cleanups.clear();
}

/**
 * State container for the navigation link tracker.
 */
export interface RouteScanner {
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  matcher: RouteMatcher;
  urlAdapter: ReturnType<typeof createAdapter>;
  activeClass: string;
  trackedLinks: Set<Element>;
  pathCache: WeakMap<Element, string>;
  activeStateCache: WeakMap<Element, boolean>;
  linkObserver?: MutationObserver;
}

/**
 * Creates a scanner that tracks elements to apply "active" CSS classes.
 */
export function createRouteScanner(
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> },
  matcher: RouteMatcher,
  urlAdapter: ReturnType<typeof createAdapter>,
  activeClass: string
): RouteScanner {
  return {
    config,
    matcher,
    urlAdapter,
    activeClass,
    trackedLinks: new Set(),
    pathCache: new WeakMap(),
    activeStateCache: new WeakMap(),
  };
}

/**
 * Initializes reactive tracking for navigation links across the entire document.
 *
 * When to use:
 * - Call once during application bootstrap to enable automatic "active" link styling.
 *
 * Logic: Link Lifecycle Management
 * 1. Uses MutationObserver to detect links injected via AJAX or templates.
 * 2. Binds reactive effects to each link to toggle classes based on the current atom state.
 * 3. Automatically cleans up effects when elements are removed from the DOM.
 *
 * @param scanner - The scanner state.
 * @param currentRouteAtom - The reactive atom containing the current path.
 *
 * @example
 * setupRouteScanner(scanner, router.current);
 */
export function setupRouteScanner(scanner: RouteScanner, currentRouteAtom: ReadonlyAtom<string>) {
  const resolvePath = (el: Element, stripQuery = false) => {
    const attr = el.getAttribute('data-route');
    const path = attr || scanner.urlAdapter.resolveAnchor(el);
    if (!path) return '';
    return stripQuery ? splitPath(path).route : path;
  };

  const currentPatternAtom = computed(() =>
    getRoutePattern(scanner.matcher, currentRouteAtom.value)
  );

  const updateActive = (el: Element, current: string, pattern: string) => {
    // Optimization: Cache path strings and state to avoid redundant DOM reads and class toggles.
    const path = scanner.pathCache.get(el) || resolvePath(el, true);
    const active = path === current || path === pattern;
    if (scanner.activeStateCache.get(el) === active) return;
    scanner.activeStateCache.set(el, active);
    updateActiveState({ el, active, activeClass: scanner.activeClass });
  };

  const trackLink = (el: Element) => {
    const path = resolvePath(el, true);
    scanner.pathCache.set(el, path);

    if (scanner.trackedLinks.has(el)) {
      updateActive(el, currentRouteAtom.peek(), currentPatternAtom.peek());
      return;
    }

    scanner.trackedLinks.add(el);
    const sub = effect(() => {
      updateActive(el, currentRouteAtom.value, currentPatternAtom.value);
    });

    // Cleanup: Leverages the registry to ensure memory is released when the link is destroyed.
    registry.onCleanup(el, () => {
      scanner.trackedLinks.delete(el);
      sub.dispose();
    });
  };

  const scan = () => document.querySelectorAll<HTMLElement>(NAV_SPEC.selectors).forEach(trackLink);

  // Logic: Dynamic Content Support
  // Handles scenarios where links are added dynamically (e.g., list rendering or async components).
  scanner.linkObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const el = node as Element;
            if (el.matches(NAV_SPEC.selectors)) trackLink(el);
            el.querySelectorAll(NAV_SPEC.selectors).forEach((c) => trackLink(c));
          }
        });
      } else if (m.type === 'attributes') trackLink(m.target as Element);
    }
  });

  scanner.linkObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: NAV_SPEC.attributes as unknown as string[],
  });

  scan();
  return { scan, resolvePath };
}

/**
 * Scans the initial DOM for declarative route definitions.
 *
 * Logic: Declarative Route Manifest Discovery
 * Extracts route definitions from `<template data-path="...">` tags.
 * This allows defining the application structure directly in HTML.
 *
 * @returns A partial route manifest and the identified default path.
 *
 * @example
 * // HTML: <template data-path="/home" data-default>...</template>
 * const { routes, default: def } = discoverRoutes();
 */
export function discoverRoutes(): {
  routes: Record<string, RouteDefinition>;
  default: string | undefined;
} {
  const routes: Record<string, RouteDefinition> = {};
  let defaultPath: string | undefined;

  document.querySelectorAll<HTMLTemplateElement>('template[data-path]').forEach((tmpl) => {
    const path = normalizePath(tmpl.getAttribute('data-path') ?? '');
    const title = tmpl.getAttribute('title') ?? tmpl.getAttribute('data-title');
    if (!routes[path]) {
      tmpl.id ||= `route-${Math.random().toString(36).slice(2, 11)}`;
      routes[path] = { template: `#${tmpl.id}`, ...(title ? { title } : {}) };
    } else if (title && !routes[path].title) {
      routes[path].title = title;
    }

    if (tmpl.hasAttribute('data-default')) {
      defaultPath = path;
    }
  });

  return { routes, default: defaultPath };
}

/**
 * Intercepts document-level clicks to implement "hijack" navigation.
 *
 * Logic: Global Click Interception
 * Decides whether a click should be handled by the router based on:
 * 1. Is it a valid navigation click (e.g., Left click without modifiers)?
 * 2. Does the target match a known route or the 'notFound' handler?
 * 3. Does the target represent a file download? (Heuristic: ignore dots in paths unless matched).
 *
 * @returns A cleanup function to unbind the global listener.
 */
export function setupRouteInterceptor(
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> },
  matcher: RouteMatcher,
  resolvePath: (el: Element) => string,
  navigate: (path: string) => Promise<void>
): () => void {
  const shouldIntercept = (path: string, el: Element): boolean => {
    // Reason: Avoid hijacking clicks for file downloads (e.g., resume.pdf).
    // If a path contains an extension, we only intercept if it specifically matches a route pattern.
    if (el instanceof HTMLAnchorElement) {
      const last = path.split('/').pop() ?? '';
      if (last.includes('.') && !getRoutePattern(matcher, splitPath(path).route)) return false;
    }
    return !!getRoutePattern(matcher, splitPath(path).route) || !!config.notFound;
  };

  const onClick = (e: JQuery.TriggeredEvent) => {
    if (e.isDefaultPrevented() || !isNavigationClick(e)) return;
    const el = e.currentTarget as HTMLElement;
    if (!isInterceptee(el)) return;
    const path = resolvePath(el);
    if (path && shouldIntercept(path, el)) {
      e.preventDefault();
      navigate(path);
    }
  };

  $(document).on('click', NAV_SPEC.selectors, onClick);
  return () => $(document).off('click', NAV_SPEC.selectors, onClick);
}
