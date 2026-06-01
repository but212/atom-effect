/**
 * @module AEJRouteTypes
 *
 * Responsibility:
 * Defines the core data structures and interfaces for the AEJ routing system,
 * including URL state snapshots, adapter contracts, and matching results.
 */

import type { Option } from '@but212/atom-effect-utils';
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
  readonly resolveAnchor: (el: Element) => string;

  /** Sets up a listener for browser navigation events (popstate or hashchange). */
  readonly setupListener: (handler: () => void) => () => void;
}

/**
 * Logic: Compiled Route Metadata
 * Internal metadata container for a resolved route pattern and its definition.
 */
export interface CompiledRoute {
  readonly pattern: string;
  readonly def: RouteDefinition;
}

/**
 * Logic: Polymorphic Match Result
 * Outcome of a route matching operation, using `Option` to safely represent
 * successful matches (with params) or misses.
 */
export type MatchResult = Option<{
  readonly route: CompiledRoute;
  readonly params: Record<string, string>;
}>;
