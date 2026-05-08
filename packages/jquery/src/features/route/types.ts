import type { Option } from '@but212/atom-effect-utils';
import type { RouteDefinition } from '@/types';

/**
 * Represents the current parsed state of a URL.
 *
 * Logic: Data Contract
 * Provides an immutable snapshot used to bridge the gap between browser-specific
 * URL states and the router's internal reactive state.
 */
export type URLState = {
  readonly path: string;
  readonly query: Record<string, string>;
  readonly url: string;
};

/**
 * Interface for browser URL interaction.
 *
 * Logic: State Adaptation
 * Abstracting History and Hash behavior behind this interface allows the router
 * to remain agnostic of the underlying URL strategy.
 */
export interface UrlAdapter {
  /** Retrieves the current path and query from the browser. */
  readonly get: (base: string) => URLState;

  /** Updates the browser URL and returns the new state. */
  readonly commit: (fullPath: string, base: string) => URLState;

  /** Rolls back the browser URL to a previous state (used when navigation is rejected). */
  readonly revert: (previousUrl: string) => void;

  /** Resolves an anchor element's destination relative to the base path. */
  readonly resolveAnchor: (el: Element, base: string) => string;

  /** Sets up a listener for browser navigation events (popstate or hashchange). */
  readonly setupListener: (handler: () => void) => () => void;
}

/**
 * Internal metadata for a compiled route pattern.
 */
export interface CompiledRoute {
  readonly pattern: string;
  readonly def: RouteDefinition;
}

/**
 * Outcome of a route matching operation.
 *
 * Logic: Polymorphic Result
 * Uses the `Option` type to represent a successful match with params or a miss.
 */
export type MatchResult = Option<{
  readonly route: CompiledRoute;
  readonly params: Record<string, string>;
}>;

/**
 * A single entry in the route matcher containing both metadata and matching logic.
 */
export interface MatchEntry {
  readonly pattern: string;
  readonly def: RouteDefinition;

  /** Executes the matching logic against a given path. */
  readonly match: (path: string) => MatchResult;
}
