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
        let p = location.pathname;
        if (base && p.startsWith(base)) p = p.substring(base.length);
        return {
          path: normalizePath(p),
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
      revert: (prev) => {
        if (location.pathname + location.search !== prev) {
          try {
            history.replaceState(null, '', prev);
          } catch {
            /* ignore */
          }
        }
      },
      resolveAnchor: (el) => resolveAnchorPath(el, base),
      setupListener: (h) => {
        window.addEventListener('popstate', h);
        return () => window.removeEventListener('popstate', h);
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
    revert: (prev) => {
      if (location.hash !== prev) location.hash = prev;
    },
    resolveAnchor: (el) => resolveAnchorPath(el, base),
    setupListener: (h) => {
      window.addEventListener('hashchange', h);
      return () => window.removeEventListener('hashchange', h);
    },
  };
}

export interface RouteMatcher {
  readonly exact: Map<string, RouteDefinition>;
  readonly dynamic: Array<{
    readonly pattern: string;
    readonly def: RouteDefinition;
    readonly regex: RegExp;
    readonly paramNames: string[];
  }>;
}

/**
 * Optimization: Dynamic Route Compilation
 * Compiles a route pattern containing parameters into a RegExp for matching
 * and extracts parameter names.
 */
function compileDynamicRoute(pattern: string, def: RouteDefinition) {
  const paramNames: string[] = [];
  const regex = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    })}$`
  );
  return { pattern, def, regex, paramNames };
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
      const def = routes[path];
      if (def === undefined) continue;
      const normalized = normalizePath(path);
      if (normalized.includes(':')) {
        dynamic.push(compileDynamicRoute(normalized, def));
      } else {
        exact.set(normalized, def);
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
  const exactDef = matcher.exact.get(path);
  if (exactDef) {
    return { route: { pattern: path, def: exactDef }, params: {} };
  }
  for (let i = 0, len = matcher.dynamic.length; i < len; i++) {
    const item = matcher.dynamic[i];
    if (item === undefined) continue;
    const match = path.match(item.regex);
    if (match) {
      const params: Record<string, string> = {};
      for (let j = 0, pLen = item.paramNames.length; j < pLen; j++) {
        const name = item.paramNames[j];
        if (name === undefined) continue;
        const val = match[j + 1] || '';
        if (val.indexOf('%') !== -1) {
          try {
            params[name] = decodeURIComponent(val);
            continue;
          } catch {
            /* fallback to raw value if decoding fails */
          }
        }
        params[name] = val;
      }
      return { route: { pattern: item.pattern, def: item.def }, params };
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
      def: match.route.def,
      pattern: match.route.pattern,
      params: match.params,
      isMatch: true,
    };
  }
  const fallback = notFoundPath ? routes[notFoundPath] : undefined;
  return { def: fallback, pattern: normalized, params: {}, isMatch: false };
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
    def,
    pattern: routeName,
    params: matchParams,
    isMatch,
  } = resolveRoute(matcher, path || config.default, config.routes, config.notFound);
  const params = { ...query, ...matchParams };

  if (!def && !isMatch) {
    return { success: true, path: routeName, query, params, def: undefined };
  }

  if (def?.onEnter) {
    // Logic: Guard Execution
    // Guards are executed 'untracked' to prevent the router from becoming a dependency
    // of whatever reactive state the guard happens to read.
    const res = untracked(() => def.onEnter?.(params, router));
    if (res === false) return { success: false };
    if (res) Object.assign(params, res);
  }

  return {
    success: true,
    path: !path || path === '/' ? routeName : path,
    query,
    params,
    def,
  };
}
