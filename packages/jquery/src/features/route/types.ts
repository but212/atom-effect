/**
 * @module AEJRouteTypes
 *
 * Responsibility:
 * Defines the core data structures and interfaces for the AEJ routing system,
 * including URL state snapshots, adapter contracts, and matching results.
 */

import type { RouteDefinition } from '@/types';

/**
 * Logic: Immutable Navigation State
 * Represents a parsed snapshot of a URL, serving as the bridge between
 * browser-specific location data and the router's reactive engine.
 */
export type URLState = {
  readonly path: string;
  readonly query: Record<string, string>;
  readonly url: string;
};

/**
 * Logic: URL Strategy Contract
 * Interface for browser URL synchronization. Decouples the core router from
 * specific browser APIs (History, Hash) to support polymorphic navigation.
 */
export interface UrlAdapter {
  /** Retrieves the current path and query from the browser. */
  readonly get: () => URLState;

  /** Updates the browser URL and returns the new state. */
  readonly commit: (fullPath: string) => URLState;

  /** Rolls back the browser URL to a previous state (used when navigation is rejected). */
  readonly revert: (previousUrl: string) => void;

  /** Resolves an anchor element's destination relative to the base path. */
  readonly resolveAnchor: (element: Element) => string;

  /** Sets up a listener for browser navigation events (popstate or hashchange). */
  readonly setupListener: (handler: () => void) => () => void;
}

/**
 * Logic: Compiled Route Metadata
 * Internal metadata container for a resolved route pattern and its definition.
 */
export interface CompiledRoute {
  readonly pattern: string;
  readonly routeDefinition: RouteDefinition;
}

/**
 * Logic: Polymorphic Match Result
 * Outcome of a route matching operation, using explicit null to safely represent
 * misses without wrapper object allocations.
 */
export type MatchResult = {
  readonly route: CompiledRoute;
  readonly params: Record<string, string>;
} | null;

/**
 * Logic: Strict Navigation Outcome
 * Represents the final state of a navigation attempt. Uses a discriminated union
 * to eliminate impossible states where path exists but success is false.
 */
export type NavigationResult =
  | { readonly success: false }
  | {
      readonly success: true;
      readonly path: string;
      readonly query: Record<string, string>;
      readonly params: Record<string, string>;
      readonly routeDefinition: RouteDefinition | undefined;
    };
