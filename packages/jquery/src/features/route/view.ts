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
import { getRoutePattern, type RouteMatcher } from './core';
import type { UrlAdapter } from './types';

/**
 * State container for a specific routing target.
 */
export interface RouteRenderer {
  $target: JQuery<HTMLElement>;
  config: Required<RouteConfig> & { routes: Record<string, RouteDefinition> };
  urlAdapter: UrlAdapter;
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
  urlAdapter: UrlAdapter
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

  if (def.render) {
    def.render(container, routeName, params, onUnmount, router);
  } else if (def.template) {
    const tmpl = document.querySelector(def.template);
    if (tmpl instanceof HTMLTemplateElement) {
      container.appendChild(tmpl.content.cloneNode(true));
      def.onMount?.($(container).children(), onUnmount, router);
    }
  }

  // Security & DX: Validate that all components in the new view are registered.
  // Prevents "silent failures" where custom elements appear as empty tags.
  if (debug.enabled && typeof customElements !== 'undefined') {
    for (const el of container.querySelectorAll(':not(:defined)')) {
      const tagName = el.tagName.toLowerCase();
      if (tagName.includes('-')) {
        debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
      }
    }
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
 * Logic: Reactive Link Tracking
 * Initializes reactive tracking for navigation links across the entire document.
 */
export function setupRouteScanner(
  matcher: RouteMatcher,
  urlAdapter: UrlAdapter,
  activeClass: string,
  currentRouteAtom: ReadonlyAtom<string>
) {
  const trackedLinks = new Set<Element>();
  const pathCache = new WeakMap<Element, string>();
  const activeStateCache = new WeakMap<Element, boolean>();

  const resolvePath = (el: Element, stripQuery = false) => {
    const attr = el.getAttribute('data-route');
    const path = attr || urlAdapter.resolveAnchor(el);
    if (!path) return '';
    return stripQuery ? splitPath(path).route : path;
  };

  const currentPatternAtom = computed(() => getRoutePattern(matcher, currentRouteAtom.value));

  const updateActive = (el: Element, current: string, pattern: string) => {
    const path = pathCache.get(el) || resolvePath(el, true);
    const active = path === current || path === pattern;
    if (activeStateCache.get(el) === active) return;
    activeStateCache.set(el, active);
    updateActiveState({ el, active, activeClass });
  };

  const trackLink = (el: Element) => {
    const path = resolvePath(el, true);
    pathCache.set(el, path);

    if (trackedLinks.has(el)) {
      updateActive(el, currentRouteAtom.peek(), currentPatternAtom.peek());
      return;
    }

    trackedLinks.add(el);
    updateActive(el, currentRouteAtom.peek(), currentPatternAtom.peek());

    // Cleanup: Leverages the registry to ensure memory is released when the link is destroyed.
    registry.onCleanup(el, () => {
      trackedLinks.delete(el);
    });
  };

  const scan = () => {
    for (const el of document.querySelectorAll<HTMLElement>(NAV_SPEC.selectors)) {
      trackLink(el);
    }
  };

  // Logic: Centralized Active Link Sync
  // Instead of creating O(N) effects per link, we use a single effect that iterates
  // over the centralized set of tracked links.
  const syncSub = effect(() => {
    const current = currentRouteAtom.value;
    const pattern = currentPatternAtom.value;
    for (const el of trackedLinks) {
      updateActive(el, current, pattern);
    }
  });

  // Logic: Dynamic Content Support
  // Handles scenarios where links are added dynamically (e.g., list rendering or async components).
  const linkObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const el = node as Element;
            if (el.matches(NAV_SPEC.selectors)) trackLink(el);
            for (const c of el.querySelectorAll(NAV_SPEC.selectors)) {
              trackLink(c);
            }
          }
        }
      } else if (m.type === 'attributes') trackLink(m.target as Element);
    }
  });

  linkObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...NAV_SPEC.attributes],
  });

  scan();
  return {
    scan,
    resolvePath,
    disconnect: () => {
      syncSub.dispose();
      linkObserver.disconnect();
    },
  };
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

  for (const tmpl of document.querySelectorAll<HTMLTemplateElement>('template[data-path]')) {
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
  }

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
