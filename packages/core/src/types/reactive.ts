/**
 * @module ReactiveGraphTypes
 *
 * Responsibility:
 * Defines the core building blocks of the reactive dependency graph, including
 * Atoms, Computed nodes, and internal Link structures.
 *
 * Design Intent:
 * Provides a highly optimized, type-safe foundation for reactive propagation.
 * Prioritizes low memory overhead and fast graph traversals through strict
 * property ordering and bitmasking.
 */

import type { SlotBuffer } from '@but212/atom-effect-utils';
import type { BRAND, KIND } from '@/constants';
import type { AsyncStateType, DependencyId, Disposable } from './base';

/**
 * Role: Reactive Dependency Node
 * Represents any source of state that can be observed by subscribers.
 *
 * Optimization: Monomorphic Access
 * All properties are non-optional and ordered to ensure V8 optimizes access
 * via stable "Hidden Classes" during high-frequency graph traversals.
 */
export interface Dependency<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  /**
   * Logic: Engine-Level Identity
   * Used for indexing and identifying nodes within the global reactive graph.
   * @internal
   */
  readonly id: DependencyId;

  /**
   * Logic: Version Tracking
   * Monotonic counter incremented whenever the value changes.
   * Subscribers compare this against their cached version to detect "drift".
   * @internal
   */
  version: number;

  /**
   * Logic: Bitmask Flags
   * Encodes lifecycle (disposed), type (computed), and async status into a
   * single integer for low-overhead status checks.
   * @internal
   */
  flags: number;

  /**
   * Logic: Epoch Tracking
   * Tracks the last scheduler epoch this node was visited to prevent redundant
   * evaluations during a single flush cycle.
   * @internal
   */
  _lastSeenEpoch: number;

  /**
   * Optimization: Fast Computed Check
   * discriminator for skipping complex logic for non-derived atoms.
   * @internal
   */
  readonly isComputed: boolean;

  /**
   * Optimization: Quick Error Check
   * flag for immediate error detection without inspecting deep state.
   * @internal
   */
  readonly hasError: boolean;

  /**
   * Role: Reactive Connection Factory
   * Establishes a link between this dependency and a subscriber.
   * Returns a cleanup handle to sever the connection.
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
 * Role: Derived Reactive Atom
 * Represents a value computed from other atoms or reactive nodes.
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
   * Logic: Forced Re-computation
   * Manually marks the node as stale, forcing it to re-evaluate on next access
   * regardless of dependency status.
   */
  invalidate(): void;
}

/**
 * Role: Reactive Update Consumer
 * Represents a target that can react to dependency changes.
 */
export interface Subscriber {
  /** Invoked by the scheduler to perform the node's update logic. */
  execute(): void;
}

/**
 * Role: Effect Lifecycle Handle
 * Provides control and diagnostic information for a running side-effect.
 */
export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  /** Forces an immediate execution of the effect logic. */
  run(): void;
  /** Indicates if the effect has been permanently stopped. */
  readonly isDisposed: boolean;
  /**
   * Impact: Frequency Monitoring
   * Cumulative count of executions used to detect runaway loops.
   */
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
export type Subscription<T> =
  | {
      /** Discriminator (0: Function, 1: Object). */
      readonly k: typeof KIND.Fn;
      /** The target payload (callback or Subscriber object). */
      readonly t: (newValue?: T, oldValue?: T) => void;
    }
  | {
      /** Discriminator (0: Function, 1: Object). */
      readonly k: typeof KIND.Obj;
      /** The target payload (callback or Subscriber object). */
      readonly t: Subscriber;
    };

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
 * Role: Reactive Node Payload (Internal)
 * Base structure for any reactive node containing properties independent
 * of the value type.
 * @internal
 */
export interface ReactiveNodeBase {
  flags: number;
  version: number;
  _lastSeenEpoch: number;
  _nextEpoch: number | undefined;
  _trackCount: number;
  _trackEpoch: number;
  _error: Error | null;
  readonly isRejected: boolean;
  readonly id: DependencyId;
  /** Fast Dispatch Discriminator */
  _k?: typeof KIND.Obj | undefined;
  /** Optimized storage for upstream dependencies. */
  _storage: {
    slots?: unknown | null;
    deps: DepBufferState | null;
  };
}

/**
 * Role: Full Reactive Node (Internal)
 * The complete structure for a reactive node participating in the graph,
 * including listeners and upstream buffers.
 * @internal
 */
export interface ReactiveNode<T> extends ReactiveNodeBase {
  /** Optimized storage for listeners and upstream dependencies. */
  _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  };
}

/**
 * Role: Dependency Buffer State
 * State container for managing a node's upstream links.
 * @internal
 */
export interface DepBufferState {
  /** Flat buffer of active links. */
  slots: SlotBuffer<DependencyLink>;
  /**
   * Optimization: Fast O(1) Lookup
   * Indexer for immediate dependency retrieval during tracking sessions.
   */
  map: Map<Dependency, number> | null;
  /**
   * Optimization: State Flags
   * Encodes buffer status (e.g., hasComputeds) into a bitmask.
   */
  flags: number;
}
