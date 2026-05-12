/**
 * @module Reactive_Graph_Types
 *
 * Responsibility:
 * Defines the core building blocks of the reactive dependency graph, including
 * Atoms, Computed nodes, and internal Link structures.
 */

import type { Prettify, SlotBuffer } from '@but212/atom-effect-utils';
import type { BRAND, KIND } from '@/constants';
import type { AsyncStateType, DependencyId, Disposable } from './base';

/**
 * The internal contract for any node that can act as a reactive dependency.
 *
 * Optimization: Monomorphic Access
 * All properties are non-optional to ensure V8 optimizes property access
 * via "Hidden Classes" during high-frequency graph traversals.
 */
export interface Dependency<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  /**
   * Unique engine-level ID for graph indexing.
   * @internal
   */
  readonly id: DependencyId;

  /**
   * Monotonic update counter.
   * Used by subscribers to detect if this dependency has drifted.
   * @internal
   */
  version: number;

  /**
   * Combined bitmask representing lifecycle, type, and async state.
   * @internal
   */
  flags: number;

  /**
   * Tracks if this node was visited during the current scheduler epoch.
   * @internal
   */
  _lastSeenEpoch: number;

  /**
   * Fast-path discriminator for computed logic.
   * @internal
   */
  readonly isComputed: boolean;

  /**
   * Quick-check flag for error presence.
   * @internal
   */
  readonly hasError: boolean;

  /**
   * Core engine method for establishing a reactive connection.
   * Returns a cleanup function.
   * @internal
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /** Retrieves the value without triggering dependency tracking. */
  peek(): T;

  /** The current value of the node. */
  readonly value: T;
}

/**
 * A read-only reactive container.
 */
export interface ReadonlyAtom<T = unknown> extends Dependency<T>, Disposable {
  /** Returns the count of active listeners for diagnostic purposes. */
  subscriberCount(): number;
}

/**
 * A reactive container supporting read and write operations.
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Triggers a notification cycle to all dependent subscribers upon assignment. */
  value: T;
}

/**
 * A derived reactive value resolving synchronously or asynchronously.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** @internal */
  readonly [BRAND]?: number;

  /** The current status in the asynchronous lifecycle. */
  readonly state: AsyncStateType;
  /** Indicates if the most recent computation resulted in an error. */
  readonly hasError: boolean;
  /** The specific Error object if `hasError` is true. */
  readonly lastError: Error | null;

  /** True while an asynchronous formula is executing. */
  readonly isPending: boolean;
  /** True if the node has resolved to a valid value at least once. */
  readonly isResolved: boolean;
  /** True if the current value is safe to read (resolved and error-free). */
  readonly isValid: boolean;

  /**
   * The complete list of errors caught during the last evaluation batch.
   */
  readonly errors: readonly Error[];

  /**
   * Manually marks the node as stale, forcing a re-computation on next access.
   */
  invalidate(): void;
}

/**
 * Represents a target that can react to dependency updates.
 */
export interface Subscriber {
  /** Invoked by the scheduler to perform the node's update logic. */
  execute(): void;
}

/**
 * A handle for a running side-effect.
 */
export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  /** Forces an immediate execution of the effect logic. */
  run(): void;
  /** Indicates if the effect has been permanently stopped. */
  readonly isDisposed: boolean;
  /** Cumulative count of effect executions for debugging and frequency monitoring. */
  readonly executionCount: number;
  /** True while the user-provided effect function is actively running. */
  readonly isExecuting: boolean;
}

/**
 * Optimized internal handle for a single listener.
 *
 * Logic: Dispatch Speed
 * Uses the `KIND` discriminator to allow the scheduler to invoke the target
 * without performing `typeof` checks in the update loop.
 *
 * @internal
 */
export type Subscription<T> = {
  [K in (typeof KIND)[keyof typeof KIND]]: Prettify<{
    /** Discriminator (0: Function, 1: Object). */
    readonly k: K;
    /** The target payload (callback or Subscriber object). */
    readonly t: K extends typeof KIND.Fn ? (newValue?: T, oldValue?: T) => void : Subscriber;
  }>;
}[(typeof KIND)[keyof typeof KIND]];

/**
 * Represents a single directed edge in the graph (Subscriber -> Dependency).
 *
 * Logic: Drift Detection
 * Stores the dependency's `version` at the time of the link creation.
 * If the link's version doesn't match the node's version, the edge is stale.
 *
 * @internal
 */
export interface DependencyLink {
  /** The dependency node being observed. */
  node: Dependency;
  /** The version of the node when the link was established. */
  version: number;
  /** The unsubscription cleanup function. */
  unsub: (() => void) | undefined;
}

/**
 * The base structure for any reactive node participating in the graph.
 * @internal
 */
export interface ReactiveNode<T> {
  flags: number;
  version: number;
  _lastSeenEpoch: number;
  _nextEpoch: number | undefined;
  readonly id: DependencyId;
  /** Optimized storage for listeners and upstream dependencies. */
  _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  };
}

/**
 * State container for the dependency tracking buffer.
 * @internal
 */
export interface DepBufferState {
  /** Flat buffer of active links. */
  slots: SlotBuffer<DependencyLink>;
  /** Indexer for fast O(1) dependency lookup. */
  map: Indexer;
  /** Optimization: Skip graph checks if no computed nodes are present. */
  hasComputeds: boolean;
}

/**
 * Strategy interface for high-speed dependency deduplication.
 * @internal
 */
export interface Indexer {
  get(dep: Dependency): number | undefined;
  set(dep: Dependency, index: number): void;
  delete(dep: Dependency): void;
}
