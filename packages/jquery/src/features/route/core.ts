/**
 * @module AEJRouteCore
 *
 * Responsibility:
 * Provides the low-level engine for the routing system, including URL
 * adapter abstractions (History/Hash) and a tiered route matching compiler.
 */

import { untracked } from '@but212/atom-effect';
import { Option, Result } from '@but212/atom-effect-utils';
import { normalizePath, parseQuery, resolveAnchorPath, splitPath } from '@/core/navigation';
import type { RouteDefinition, Router } from '@/types';
import type { MatchEntry, MatchResult, UrlAdapter } from './types';

/**
 * Logic: Modern History API Adapter
 * Orchestrates URL synchronization using the standard window.history API.
 */
const HISTORY_ADAPTER: UrlAdapter = {
  get: (base) => {
    let p = location.pathname;
    // Constraint: Strips the base path to ensure route matching is relative to the app root.
    if (base && p.startsWith(base)) p = p.substring(base.length);
    return {
      path: normalizePath(p),
      query: parseQuery(location.search.substring(1)),
      url: location.pathname + location.search,
    };
  },
  commit: (fullPath, base) => {
    const { route, query } = splitPath(fullPath);
    const url = new URL(route, `${location.origin}${base}/`.replace(/\/+$/, '/'));
    Option.map(query, (q) => (url.search = q));
    const urlStr = url.pathname + url.search;
    Result.tryCatch(() => history.pushState(null, '', urlStr));
    return { path: normalizePath(route), query: Object.fromEntries(url.searchParams), url: urlStr };
  },
  revert: (prev) => {
    // Reason: Prevents redundant state pushes if the location already matches the target.
    if (location.pathname + location.search !== prev) {
      Result.tryCatch(() => history.replaceState(null, '', prev));
    }
  },
  resolveAnchor: (el, base) => resolveAnchorPath(el, base),
  setupListener: (h) => {
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  },
};

/**
 * Logic: Legacy Hash Adapter
 * Compatibility mode for static hosting or environments without
 * server-side URL rewrite support.
 */
const HASH_ADAPTER: UrlAdapter = {
  get: () => {
    const { route, query } = splitPath(location.hash.slice(1));
    return { path: route, query: parseQuery(Option.unwrapOr(query, '')), url: location.hash };
  },
  commit: (fullPath) => {
    const { route, query } = splitPath(fullPath);
    const url = `#${Option.isSome(query) ? `${route}?${Option.unwrap(query)}` : route}`;
    location.hash = url;
    return { path: normalizePath(route), query: parseQuery(Option.unwrapOr(query, '')), url };
  },
  revert: (prev) => {
    if (location.hash !== prev) location.hash = prev;
  },
  resolveAnchor: (el, base) => HISTORY_ADAPTER.resolveAnchor(el, base),
  setupListener: (h) => {
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  },
};

/**
 * Logic: URL Adapter Factory
 * Creates a URL adapter based on the application's routing strategy.
 *
 * When to use:
 * - Use 'history' for clean URLs (requires server-side fallback).
 * - Use 'hash' for legacy support or zero-config static hosting.
 */
export const createAdapter = (mode: 'history' | 'hash', basePath?: string) => {
  const adapter = mode === 'history' ? HISTORY_ADAPTER : HASH_ADAPTER;
  const base = basePath ? `/${normalizePath(basePath)}` : '';
  return {
    get: () => adapter.get(base),
    commit: (path: string) => adapter.commit(path, base),
    revert: (prev: string) => adapter.revert(prev),
    resolveAnchor: (el: Element) => adapter.resolveAnchor(el, base),
    setupListener: (h: () => void) => adapter.setupListener(h),
  };
};

export interface RouteMatcher {
  readonly exact: Map<string, MatchEntry>;
  readonly dynamic: MatchEntry[];
}

const SUPPORTS_URL_PATTERN = typeof URLPattern !== 'undefined';

/**
 * Optimization: Tiered Route Compilation
 * Routes are compiled into the most efficient matcher possible based on
 * pattern complexity and browser capability.
 *
 * Reason: Minimizes matching overhead by prioritizing O(1) lookups for
 * static routes and leveraging native URLPattern API where available.
 */
const COMPILERS: Array<{
  test: (pattern: string) => boolean;
  compile: (pattern: string, def: RouteDefinition) => MatchEntry;
}> = [
  // Tier 1: Static Routes
  // Logic: Direct string equality for patterns without placeholders.
  {
    test: (p) => !p.includes(':'),
    compile: (pattern, def) => {
      const result = Option.some({ route: { pattern, def }, params: {} });
      return {
        pattern,
        def,
        match: (path) => (path === pattern ? result : Option.none),
      };
    },
  },
  // Tier 2: Native URLPattern API
  // Logic: Leverages modern browser internals for high-performance complex matching.
  {
    test: () => SUPPORTS_URL_PATTERN,
    compile: (pattern, def) => {
      const urlPattern = new URLPattern({ pathname: `/${pattern}` });
      return {
        pattern,
        def,
        match: (path) => {
          const result = urlPattern.exec({ pathname: `/${path}` });
          if (!result) return Option.none;
          const params: Record<string, string> = {};
          const groups = result.pathname.groups;
          for (const key in groups) {
            if (Object.hasOwn(groups, key)) {
              const val = groups[key];
              if (val != null) params[key] = val;
            }
          }
          return Option.some({ route: { pattern, def }, params });
        },
      };
    },
  },
  // Tier 3: Regex Fallback
  // Logic: Robust, universal matching for legacy browsers or complex edge cases.
  {
    test: () => true,
    compile: (pattern, def) => {
      const paramNames: string[] = [];
      const regex = new RegExp(
        `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, name) => {
          paramNames.push(name);
          return '([^/]+)';
        })}$`
      );
      return {
        pattern,
        def,
        match: (path) => {
          const match = path.match(regex);
          if (!match) return Option.none;
          const params: Record<string, string> = {};
          for (let i = 0, len = paramNames.length; i < len; i++) {
            const val = match[i + 1] || '';
            if (val.indexOf('%') !== -1) {
              try {
                params[paramNames[i]!] = decodeURIComponent(val);
                continue;
              } catch {
                /* fallback to raw value if decoding fails */
              }
            }
            params[paramNames[i]!] = val;
          }
          return Option.some({ route: { pattern, def }, params });
        },
      };
    },
  },
];

/**
 * Logic: Adaptive Compilation
 * Selects and executes the optimal compiler for a given pattern.
 */
function compile(pattern: string, def: RouteDefinition): MatchEntry {
  for (let i = 0, len = COMPILERS.length; i < len; i++) {
    const compiler = COMPILERS[i]!;
    if (compiler.test(pattern)) return compiler.compile(pattern, def);
  }
  return COMPILERS.at(-1)!.compile(pattern, def);
}

/**
 * Optimization: Route Partitioning
 * Partitions routes into 'exact' and 'dynamic' buckets to enable O(1)
 * lookups for static paths while preserving order for dynamic patterns.
 */
export function createRouteMatcher(routes: Record<string, RouteDefinition>): RouteMatcher {
  const exact = new Map<string, MatchEntry>();
  const dynamic: MatchEntry[] = [];
  for (const path in routes) {
    if (Object.hasOwn(routes, path)) {
      const def = routes[path];
      if (def === undefined) continue;
      const normalized = normalizePath(path);
      const entry = compile(normalized, def);
      if (normalized.includes(':')) dynamic.push(entry);
      else exact.set(normalized, entry);
    }
  }
  return { exact, dynamic };
}

/**
 * Logic: Routing Table Matcher
 * Attempts to match a path against the compiled routing table.
 */
export function matchRoute(matcher: RouteMatcher, path: string): MatchResult {
  const exactMatch = matcher.exact.get(path);
  if (exactMatch) return exactMatch.match(path);
  for (let i = 0, len = matcher.dynamic.length; i < len; i++) {
    const result = matcher.dynamic[i]!.match(path);
    if (Option.isSome(result)) return result;
  }
  return Option.none;
}

/**
 * Logic: Pattern Resolution
 * Finds the canonical route pattern for a given resolved path.
 */
export function getRoutePattern(matcher: RouteMatcher, path: string): string {
  return Option.unwrapOr(
    Option.map(matchRoute(matcher, path), (m) => m.route.pattern),
    ''
  );
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
  if (Option.isSome(match)) {
    const m = Option.unwrap(match);
    return { def: m.route.def, pattern: m.route.pattern, params: m.params, isMatch: true };
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
) {
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
    const res = untracked(() => def.onEnter!(params, router));
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
