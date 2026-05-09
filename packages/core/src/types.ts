import type { AsyncState } from '@/constants';
import { BRAND } from '@/symbols';

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

/**
 * Handle for a managed reactive effect.
 */
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
