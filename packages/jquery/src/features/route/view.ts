/**
 * @module AEJRouteView
 *
 * Responsibility:
 * Orchestrates DOM rendering for route transitions, manages document-wide
 * navigation link tracking, and handles global click interception for
 * SPA-style navigation.
 */

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
 * Logic: Polymorphic Rendering Strategies
 * Decouples the route definition from the mounting mechanism.
 * Supports both manual JS rendering (for component-based views) and
 * declarative HTML templates.
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
 * Logic: Renderer State Initialization
 * Initializes a renderer state for a target container element.
 */
export function createRouteRenderer(
  $target: JQuery<HTMLElement>,
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> },
  urlAdapter: ReturnType<typeof createAdapter>
): RouteRenderer {
  return { $target, config, urlAdapter, cleanups: new SlotBuffer(), previousPath: '' };
}

/**
 * Logic: View Transition Orchestration
 * Manages the transition between views within a target container.
 *
 * When to use:
 * - Invoked by the router whenever a route match is confirmed to update the UI.
 *
 * Logic: Update Pipeline
 * 1. Synchronizes document metadata (Title/Meta).
 * 2. Clears the container and triggers previous view cleanups.
 * 3. Renders the new content using the defined strategy.
 * 4. Manages focus and scroll for Accessibility compliance.
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
 * Logic: Resource Disposal
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
 * Logic: Scanner State Initialization
 * Creates a scanner state for document-wide link tracking.
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
 * Logic: Reactive Link Tracking
 * Initializes reactive tracking for navigation links across the entire document.
 *
 * When to use:
 * - Call once during application bootstrap to enable automatic "active"
 *   styling for all links matching the navigation spec.
 *
 * Logic: Lifecycle Management
 * 1. Uses MutationObserver to detect links injected via AJAX or templates.
 * 2. Binds reactive effects to each link to toggle classes based on current route.
 * 3. Automatically cleans up effects when elements are removed from the DOM.
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
    // Optimization: Structural Caching
    // Reason: Prevents expensive DOM attribute reads and layout-triggering
    // class toggles during rapid navigation intent changes.
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
 * Logic: Declarative Route Discovery
 * Scans the initial DOM for declarative route definitions.
 *
 * Logic: Discovery Mechanism
 * Extracts route definitions from `<template data-path="...">` tags,
 * allowing the application structure to be defined in pure HTML.
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
 * Logic: Navigation Interception
 * Intercepts document-level clicks to implement "hijack" navigation.
 *
 * Logic: Global Interception Strategy
 * Decides whether a click should be handled by the router based on:
 * 1. Click validity (Left click without modifiers).
 * 2. Route matching (Matches a known pattern or the 'notFound' handler).
 * 3. File download heuristic (Ignores dots unless a specific route matches).
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
