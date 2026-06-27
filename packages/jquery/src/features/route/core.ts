/**
 * @module AEJRouteCore
 *
 * Responsibility:
 * Provides the low-level engine for the routing system, including URL
 * adapter abstractions (History/Hash) and a tiered route matching compiler.
 */

import { untracked } from '@but212/atom-effect';
import { normalizePath, parseQuery, resolveAnchorPath, splitPath } from '@/core/navigation';
import type { RouteDefinition, Router } from '@/types';
import type { MatchResult, NavigationResult, UrlAdapter } from './types';

/**
 * Logic: Modern History API Adapter
 * Orchestrates URL synchronization using the standard window.history API.
 */
/**
 * Logic: URL Adapter Factory
 * Creates a URL adapter based on the application's routing strategy.
 */
export function createAdapter(mode: 'history' | 'hash', basePath?: string): UrlAdapter {
  const base = basePath ? `/${normalizePath(basePath)}` : '';

  if (mode === 'history') {
    return {
      get: () => {
        let rawPathname = location.pathname;
        if (base && rawPathname.startsWith(base)) rawPathname = rawPathname.substring(base.length);
        return {
          path: normalizePath(rawPathname),
          query: parseQuery(location.search.substring(1)),
          url: location.pathname + location.search,
        };
      },
      commit: (fullPath) => {
        const { route, query } = splitPath(fullPath);
        const url = new URL(route, `${location.origin}${base}/`.replace(/\/+$/, '/'));
        if (query !== null) url.search = query;
        const urlStr = url.pathname + url.search;
        try {
          history.pushState(null, '', urlStr);
        } catch {
          /* ignore */
        }
        return {
          path: normalizePath(route),
          query: Object.fromEntries(url.searchParams),
          url: urlStr,
        };
      },
      revert: (previousUrl) => {
        if (location.pathname + location.search !== previousUrl) {
          try {
            history.replaceState(null, '', previousUrl);
          } catch {
            /* ignore */
          }
        }
      },
      resolveAnchor: (element) => resolveAnchorPath(element, base),
      setupListener: (eventListener) => {
        window.addEventListener('popstate', eventListener);
        return () => window.removeEventListener('popstate', eventListener);
      },
    };
  }

  return {
    get: () => {
      const { route, query } = splitPath(location.hash.slice(1));
      return { path: route, query: parseQuery(query || ''), url: location.hash };
    },
    commit: (fullPath) => {
      const { route, query } = splitPath(fullPath);
      const url = `#${query === null ? route : `${route}?${query}`}`;
      location.hash = url;
      return { path: normalizePath(route), query: parseQuery(query || ''), url };
    },
    revert: (previousUrl) => {
      if (location.hash !== previousUrl) location.hash = previousUrl;
    },
    resolveAnchor: (element) => resolveAnchorPath(element, base),
    setupListener: (eventListener) => {
      window.addEventListener('hashchange', eventListener);
      return () => window.removeEventListener('hashchange', eventListener);
    },
  };
}

export interface RouteMatcher {
  readonly exact: Map<string, RouteDefinition>;
  readonly dynamic: Array<{
    readonly pattern: string;
    readonly routeDefinition: RouteDefinition;
    readonly regex: RegExp;
    readonly paramNames: string[];
  }>;
}

/**
 * Optimization: Dynamic Route Compilation
 * Compiles a route pattern containing parameters into a RegExp for matching
 * and extracts parameter names.
 */
function compileDynamicRoute(pattern: string, routeDefinition: RouteDefinition) {
  const paramNames: string[] = [];
  const regex = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    })}$`
  );
  return { pattern, routeDefinition, regex, paramNames };
}

/**
 * Optimization: Route Partitioning
 * Partitions routes into 'exact' and 'dynamic' buckets to enable O(1)
 * lookups for static paths while preserving order for dynamic patterns.
 */
export function createRouteMatcher(routes: Record<string, RouteDefinition>): RouteMatcher {
  const exact = new Map<string, RouteDefinition>();
  const dynamic: RouteMatcher['dynamic'] = [];
  for (const path in routes) {
    if (Object.hasOwn(routes, path)) {
      const routeDefinition = routes[path];
      if (routeDefinition === undefined) continue;
      const normalized = normalizePath(path);
      if (normalized.includes(':')) {
        dynamic.push(compileDynamicRoute(normalized, routeDefinition));
      } else {
        exact.set(normalized, routeDefinition);
      }
    }
  }
  return { exact, dynamic };
}

/**
 * Logic: Routing Table Matcher
 * Attempts to match a path against the compiled routing table.
 */
export function matchRoute(matcher: RouteMatcher, path: string): MatchResult {
  const exactRouteDefinition = matcher.exact.get(path);
  if (exactRouteDefinition) {
    return { route: { pattern: path, routeDefinition: exactRouteDefinition }, params: {} };
  }
  for (let i = 0, dynamicRoutesLength = matcher.dynamic.length; i < dynamicRoutesLength; i++) {
    const dynamicRoute = matcher.dynamic[i];
    if (dynamicRoute === undefined) continue;
    const match = path.match(dynamicRoute.regex);
    if (match) {
      const params: Record<string, string> = {};
      for (
        let j = 0, parameterNamesLength = dynamicRoute.paramNames.length;
        j < parameterNamesLength;
        j++
      ) {
        const name = dynamicRoute.paramNames[j];
        if (name === undefined) continue;
        const matchedValue = match[j + 1] || '';
        if (matchedValue.indexOf('%') !== -1) {
          try {
            params[name] = decodeURIComponent(matchedValue);
            continue;
          } catch {
            /* fallback to raw value if decoding fails */
          }
        }
        params[name] = matchedValue;
      }
      return {
        route: { pattern: dynamicRoute.pattern, routeDefinition: dynamicRoute.routeDefinition },
        params,
      };
    }
  }
  return null;
}

/**
 * Logic: Pattern Resolution
 * Finds the canonical route pattern for a given resolved path.
 */
export function getRoutePattern(matcher: RouteMatcher, path: string): string {
  const match = matchRoute(matcher, path);
  return match === null ? '' : match.route.pattern;
}

/**
 * Logic: Route Resolution
 * Resolves a raw path into a matched route definition with parameters
 * and 404 fallback logic.
 */
export function resolveRoute(
  matcher: RouteMatcher,
  path: string,
  routes: Record<string, RouteDefinition>,
  notFoundPath?: string
) {
  const normalized = normalizePath(path);
  const match = matchRoute(matcher, normalized);
  if (match !== null) {
    return {
      routeDefinition: match.route.routeDefinition,
      pattern: match.route.pattern,
      params: match.params,
      isMatch: true,
    };
  }
  const fallback = notFoundPath ? routes[notFoundPath] : undefined;
  return { routeDefinition: fallback, pattern: normalized, params: {}, isMatch: false };
}

/**
 * Logic: Navigation Pipeline Orchestration
 * Coordinates the full transition sequence: matching, parameter merging,
 * and guard execution.
 *
 * When to use:
 * - Invoked internally by the router during navigation requests.
 */
export function resolveNavigation(
  matcher: RouteMatcher,
  config: { routes: Record<string, RouteDefinition>; default: string; notFound: string },
  path: string,
  query: Record<string, string>,
  router: Router
): NavigationResult {
  const {
    routeDefinition,
    pattern: routeName,
    params: matchParams,
    isMatch,
  } = resolveRoute(matcher, path || config.default, config.routes, config.notFound);
  const params = { ...query, ...matchParams };

  if (!routeDefinition && !isMatch) {
    return { success: true, path: routeName, query, params, routeDefinition: undefined };
  }

  if (routeDefinition?.onEnter) {
    // Logic: Guard Execution
    // Guards are executed 'untracked' to prevent the router from becoming a dependency
    // of whatever reactive state the guard happens to read.
    const guardResult = untracked(() => routeDefinition.onEnter?.(params, router));
    if (guardResult === false) return { success: false };
    if (guardResult) Object.assign(params, guardResult);
  }

  return {
    success: true,
    path: !path || path === '/' ? routeName : path,
    query,
    params,
    routeDefinition: routeDefinition,
  };
}
