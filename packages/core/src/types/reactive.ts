import type { Prettify, SlotBuffer } from '@but212/atom-effect-utils';
import type { BRAND, KIND } from '@/constants';
import type { AsyncStateType, DependencyId, Disposable } from './base';

/**
 * Internal contract for dependency tracking and re-execution.
 *
 * Optimization: Monomorphic Access
 * All properties are non-optional to ensure V8 optimizes property access
 * during high-frequency graph traversals.
 *
 * @internal
 */
export interface Dependency<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  /** Unique engine-level ID. */
  readonly id: DependencyId;

  /** Monotonic update counter used for drift detection. */
  version: number;

  /** State bitmask defined in `constants.ts`. */
  flags: number;

  /** Used by the scheduler to identify if a node was visited in the current epoch. */
  _lastSeenEpoch: number;

  /** Type discriminator for fast-path checks. */
  readonly isComputed: boolean;

  /** Error state flag. */
  readonly hasError: boolean;

  /** Engine-level subscription method. */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /** Non-reactive read. */
  peek(): T;

  /** Current value. */
  readonly value: T;
}

/**
 * A read-only reactive container.
 */
export interface ReadonlyAtom<T = unknown> extends Dependency<T>, Disposable {
  /** Returns the active subscriber count for diagnostic purposes. */
  subscriberCount(): number;
}

/**
 * A reactive container supporting read and write operations.
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Setting the value triggers a notification cycle for all dependents. */
  value: T;
}

/**
 * A derived reactive value resolving synchronously or asynchronously.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** @internal */
  readonly [BRAND]?: number;

  /** Current async status (idle, pending, resolved, rejected). */
  readonly state: AsyncStateType;
  /** True if the last computation threw an error. */
  readonly hasError: boolean;
  /** The most recent error encountered. */
  readonly lastError: Error | null;

  /** True during async execution. */
  readonly isPending: boolean;
  /** True if at least one successful resolution has occurred. */
  readonly isResolved: boolean;
  /** True if the current value is valid (resolved and no active error). */
  readonly isValid: boolean;

  /**
   * Aggregate list of errors from the last evaluation cycle.
   */
  readonly errors: readonly Error[];

  /**
   * Manually flags the computation as dirty.
   */
  invalidate(): void;
}

export interface Subscriber {
  /** Invoked by the scheduler to perform the node's update logic. */
  execute(): void;
}

export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  /** Manually triggers the effect. */
  run(): void;
  /** True if the effect is no longer active. */
  readonly isDisposed: boolean;
  /** Total execution count since creation. */
  readonly executionCount: number;
  /** True while the effect function is running. */
  readonly isExecuting: boolean;
}

/**
 * A handle for an active listener on a reactive node.
 * @internal
 */
export type Subscription<T> = {
  [K in (typeof KIND)[keyof typeof KIND]]: Prettify<{
    /** The kind of subscriber (0: Function, 1: Object). */
    readonly k: K;
    /** The subscriber target (callback or Subscriber object). */
    readonly t: K extends typeof KIND.Fn ? (newValue?: T, oldValue?: T) => void : Subscriber;
  }>;
}[(typeof KIND)[keyof typeof KIND]];

/**
 * Represents a single directed edge in the dependency graph (Subscriber -> Dependency).
 * @internal
 */
export interface DependencyLink {
  /** The node being watched. */
  node: Dependency;
  /** The version of the node when this link was established. */
  version: number;
  /** Cleanup function returned by the dependency. */
  unsub: (() => void) | undefined;
}

/**
 * The base structure for any reactive node in the graph.
 * @internal
 */
export interface ReactiveNode<T> {
  flags: number;
  version: number;
  _lastSeenEpoch: number;
  _nextEpoch: number | undefined;
  readonly id: DependencyId;
  _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  };
}

/** @internal */
export interface DepBufferState {
  slots: SlotBuffer<DependencyLink>;
  map: Indexer;
  hasComputeds: boolean;
}

/** @internal */
export interface Indexer {
  get(dep: Dependency): number | undefined;
  set(dep: Dependency, index: number): void;
  delete(dep: Dependency): void;
}
