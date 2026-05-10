import type { Equal, If, Merge, Prettify, SlotBuffer } from '@but212/atom-effect-utils';
import type { AsyncState } from '@/constants';
import { BRAND } from '@/symbols';

export type { Equal, If, Merge, Prettify };

/**
 * Logic: Dependency Value Extraction
 * Extracts the inner value type `V` from a `Dependency<V>`.
 * @internal
 */
export type UnboxDependency<D> = D extends Dependency<infer V> ? V : never;

/**
 * Logic: Safe Object Merging
 * Merges a union of dependency values into a single object.
 * @internal
 */
export type MergedDependencyValue<T extends readonly unknown[]> = Merge<UnboxDependency<T[number]>>;

/** A unique monotonic identifier for reactive dependencies. */
export type DependencyId = number;

/**
 * Interface for objects requiring explicit resource release (timers, observers, listeners).
 */
export interface Disposable {
  /**
   * Releases internal resources and detaches from the reactive graph.
   */
  dispose(): void;
}

/** Represents the possible states of an asynchronous reactive node. */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/** Configuration for initializing an atom. */
export interface AtomOptions<T = unknown> {
  /** Identifier for debugger and devtools. */
  name?: string;
  /**
   * When true, updates bypass the scheduler and notify subscribers immediately.
   * Caution: Can lead to inconsistent states if multiple synchronous updates depend on each other.
   */
  sync?: boolean;
  /** Custom comparator to prevent unnecessary updates if the value is structurally identical. */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Internal contract for dependency tracking and re-execution.
 *
 * Optimization: Monomorphic Access
 * All properties are non-optional to ensure V8 optimizes property access
 * during high-frequency graph traversals.
 *
 * Constraint: Managed State
 * The `version`, `flags`, and `_lastSeenEpoch` fields are internal engine
 * state and must not be modified by external logic.
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
 *
 * When to use:
 * - To expose state while preventing external mutation (Unidirectional Data Flow).
 * - To serve as a base for computed or derived values.
 */
export interface ReadonlyAtom<T = unknown> extends Dependency<T>, Disposable {
  /** Returns the active subscriber count for diagnostic purposes. */
  subscriberCount(): number;
}

/**
 * A reactive container supporting read and write operations.
 *
 * When to use:
 * - As the primary source of truth for application state.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * count.value++; // Triggers downstream updates.
 * ```
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Setting the value triggers a notification cycle for all dependents. */
  value: T;
}

/** Configuration for derived computed atoms. */
export interface ComputedOptions<T = unknown> {
  /** Identifier for debugging. */
  name?: string;
  /** Comparator to prune updates if the computed result hasn't changed. */
  equal?: (a: T, b: T) => boolean;
  /** Value returned before the first computation completes. */
  defaultValue?: T;
  /** When true, computation only runs when the `.value` property is accessed. */
  lazy?: boolean;
  /** Error boundary for the computation logic. */
  onError?: (error: Error) => void;
}

/**
 * A derived reactive value resolving synchronously or asynchronously.
 *
 * When to use:
 * - To encapsulate business logic that depends on other atoms.
 * - To handle asynchronous data fetching with built-in status tracking.
 *
 * @example
 * ```typescript
 * const fullName = computed(() => `${firstName.value} ${lastName.value}`);
 * console.log(fullName.value);
 * ```
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
   * Optimization: Shared with `EMPTY_ERROR_ARRAY` when no errors exist.
   */
  readonly errors: readonly Error[];

  /**
   * Manually flags the computation as dirty.
   * When to use: When external, non-reactive state influences the result.
   */
  invalidate(): void;
}

/**
 * Contract for nodes that can be scheduled for execution.
 * @internal
 */
export interface Subscriber {
  /** Invoked by the scheduler to perform the node's update logic. */
  execute(): void;
}

/** Cleanup callback for effects. */
export type EffectCleanup = () => void;

/**
 * Execution logic for a reactive effect.
 * Supports async execution and optional teardown logic.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for TypeScript return type compatibility.
export type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;

/** Configuration for reactive side-effects. */
export interface EffectOptions {
  /** Identifier for diagnostics. */
  name?: string;
  /** When true, runs immediately upon creation. */
  sync?: boolean;
  /** Reason: Protection against runaway recursive loops. */
  maxExecutionsPerSecond?: number;
  /** Reason: Protection against circular dependencies in a single flush. */
  maxExecutionsPerFlush?: number;
  /** Error handler for the effect logic and its cleanup. */
  onError?: (error: unknown) => void;
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
 * Uses Kind-based structure for data-driven dispatch.
 * @internal
 */
export interface Subscription<T> {
  /** The kind of subscriber (0: Function, 1: Object). */
  readonly k: number;
  /** The subscriber target (callback or Subscriber object). */
  readonly t: ((newValue?: T, oldValue?: T) => void) | Subscriber;
}

/**
 * Represents a single directed edge in the dependency graph (Subscriber -> Dependency).
 * @internal
 *
 * Logic: Includes a version field to implement efficient stale checks.
 * If the dependency's version doesn't match this version, the subscriber may need re-evaluation.
 */
export interface DependencyLink {
  /** The node being watched. */
  node: Dependency;
  /** The version of the node when this link was established. */
  version: number;
  /** Cleanup function returned by the dependency. */
  unsub: (() => void) | undefined;
}

/** @internal */
export interface Indexer {
  get(dep: Dependency): number | undefined;
  set(dep: Dependency, index: number): void;
  delete(dep: Dependency): void;
}

/**
 * Logic: Subscription Reconciliation State
 * Orchestrates the transition of dependencies between execution cycles.
 * @internal
 */
export interface DepBufferState {
  /**
   * Ordered sequence of active subscriptions.
   * Optimization: Uses SlotBuffer for contiguous memory and fast iteration.
   */
  slots: SlotBuffer<DependencyLink>;
  /**
   * Optimization: O(1) Lookup
   * Always present via Indexer interface to avoid branching.
   * Switched to NullIndexer when inactive.
   */
  map: Indexer;
  /**
   * Optimization: Skip Check
   * When false, indicates no computed nodes are present, allowing the engine
   * to skip recursive dirty validation.
   */
  hasComputeds: boolean;
}

/**
 * The base structure for any reactive node in the graph.
 *
 * Caution: Property order is strictly enforced for V8 performance.
 * Do not reorder fields without profiling hot-paths.
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

/**
 * Interface for nodes capable of recording reactive dependencies during execution.
 * @internal
 */
export interface DependencySubscriber {
  addDependency(dep: Dependency): void;
}

/**
 * Interface for nodes that can be scheduled for re-execution.
 * @internal
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Unified interface for nodes that both consume dependencies and execute logic.
 * (e.g., Effects, Computed Atoms, Observers)
 * @internal
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/** Diagnostic metrics for memory and resource management. @internal */
export interface PoolStats {
  acquired: number;
  released: number;
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}

/**
 * Internal interface for engine instrumentation and debugging.
 * @internal
 */
export interface DebugConfig {
  /** Master toggle for diagnostic features. */
  enabled: boolean;
  /** Toggle for infinite loop detection. */
  warnInfiniteLoop: boolean;
  /** Enables full graph traversal tracking (Performance impact: High). */
  trackGraph: boolean;
  /** Internal logger. */
  warn(condition: boolean, message: string): void;
  /** Instruments objects with metadata for devtools. */
  attachDebugInfo(obj: object, type: string, id: number, customName?: string): void;
  /** Resolves human-readable names for diagnostic messages. */
  getDebugName(obj: object | null | undefined): string | undefined;
  /** Identifies the internal node type. */
  getDebugType(obj: object | null | undefined): string | undefined;
  /** Records update frequency for loop detection. */
  trackUpdate(id: DependencyId, name?: string): void;
  /** Registers nodes for global graph snapshots. */
  registerNode(node: object & { id: DependencyId }): void;
  /** Records evaluation failures during dirty checks. */
  trackEvaluationFailure(id: DependencyId): void;
  /** Generates a JSON snapshot of the dependency graph. */
  dumpGraph(): Record<string, unknown>[];
}

/**
 * Global configuration parameters for the Scheduler.
 * @internal
 */
export interface SchedulerConfig {
  /** Prevents infinite loops or runaway effects from freezing the main thread. */
  MAX_EXECUTIONS_PER_SECOND: number;
  /** Detects and stops circular dependencies within a single microtask. */
  MAX_EXECUTIONS_PER_EFFECT: number;
  /** Limits the total workload per flush to maintain frame-rate stability. */
  MAX_EXECUTIONS_PER_FLUSH: number;
  /** Safety break for the drain-loop to prevent stack overflows or infinite flushing. */
  MAX_FLUSH_ITERATIONS: number;
  /** Ensures a minimum number of iterations are processed to allow for nested batched updates. */
  MIN_FLUSH_ITERATIONS: number;
  /** Threshold for shrinking the internal batch queue to release memory back to the heap. */
  BATCH_QUEUE_SHRINK_THRESHOLD: number;
}
