import type { AsyncState } from '@/constants';
import { BRAND } from '@/symbols';

/** A unique monotonic identifier for reactive dependencies. */
export type DependencyId = number;

// ============================================================================
// Utility Types for Deep Nesting (Lenses)
// ============================================================================

/**
 * A helper type that converts a numeric string literal into a number type.
 * @internal
 */
export type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;

/** The maximum recursion depth allowed for path generation and traversal. */
export type MaxDepth = 8;

/**
 * Types that are considered terminal nodes during path exploration.
 * @internal
 */
type TerminalTypes =
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | Promise<unknown>
  | Function;

/**
 * Generates a union of all possible dot-separated paths within a given type.
 *
 * This utility excludes prototype methods and stops exploration at terminal types
 * (such as Date, RegExp, or Functions) to ensure efficient type checking.
 *
 * When to use:
 * - To provide IDE autocomplete for deep object lensing in `atomLens`.
 * - To enforce type safety for string paths used in state navigation.
 *
 * @example
 * ```typescript
 * type User = { profile: { name: string; age: number } };
 * type UserPaths = Paths<User>; // "profile" | "profile.name" | "profile.age"
 * ```
 */
export type Paths<T, D extends unknown[] = []> = D['length'] extends MaxDepth
  ? never
  : T extends TerminalTypes
    ? never
    : T extends object
      ? {
          [K in keyof T & (string | number)]: T[K] extends Function
            ? never
            : NonNullable<T[K]> extends object
              ? `${K}` | `${K}.${Paths<NonNullable<T[K]>, [...D, 1]>}`
              : `${K}`;
        }[keyof T & (string | number)]
      : never;

/**
 * Resolves the type of the value located at a specific dot-path.
 *
 * Logic: The type is resolved by recursively following the provided path string.
 * It automatically handles optional and nullable properties using `NonNullable`
 * to determine the most specific value type.
 *
 * When to use:
 * - To infer the return type of a lens atom based on its path.
 *
 * @example
 * ```typescript
 * type User = { profile: { name: string } };
 * type Name = PathValue<User, "profile.name">; // string
 * ```
 */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? StringKeyToNumber<K> extends keyof NonNullable<T>
    ? PathValue<NonNullable<NonNullable<T>[StringKeyToNumber<K> & keyof NonNullable<T>]>, Rest>
    : never
  : StringKeyToNumber<P> extends keyof NonNullable<T>
    ? NonNullable<T>[StringKeyToNumber<P> & keyof NonNullable<T>]
    : never;

// ============================================================================
// Core Types
// ============================================================================

/**
 * An interface representing an object with explicit lifecycle management.
 */
export interface Disposable {
  /**
   * Releases resources and terminates internal subscriptions.
   */
  dispose(): void;
}

/** Represents the possible states of an asynchronous reactive node. */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/** Configuration options for creating an atom. */
export interface AtomOptions<T = unknown> {
  /** A human-readable name used for diagnostic purposes. */
  name?: string;
  /** If true, subscribers are notified synchronously upon change. Default is false (microtask scheduled). */
  sync?: boolean;
  /** A custom equality function used to determine if a value change should trigger notifications. */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Represents a reactive container whose value can be observed but not directly mutated.
 *
 * When to use:
 * - To expose state that should only be derived or updated by specific logic (e.g., computed atoms).
 * - To pass state to UI components while enforcing unidirectional data flow.
 */
export interface ReadonlyAtom<T = unknown> extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;

  /**
   * The current value of the atom.
   * Accessing this property within a reactive context (like an effect or computed)
   * registers the atom as a dependency.
   */
  readonly value: T;

  /**
   * Registers a listener to be notified when the atom's value changes.
   *
   * @param listener - A callback function or a Subscriber object.
   * @returns A function to terminate the subscription.
   *
   * @example
   * ```typescript
   * const unsub = atom.subscribe((nv, ov) => console.log(`Changed to ${nv}`));
   * unsub();
   * ```
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /**
   * Performs a non-reactive read of the current value.
   *
   * When to use:
   * - To access the value without creating a reactive dependency.
   */
  peek(): T;

  /** Returns the total number of active subscribers. */
  subscriberCount(): number;
}

/**
 * Represents a reactive container that supports both reading and direct mutation.
 *
 * @example
 * ```typescript
 * import { atom } from '@but212/atom-effect';
 *
 * const count = atom(0);
 * count.value = 1; // Direct assignment triggers reactive updates.
 * ```
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** The value of the atom. Assignment triggers re-computation of dependents. */
  value: T;
}

/**
 * The internal contract for all reactive nodes within the dependency graph.
 *
 * Logic: This interface defines the core properties required for dependency
 * tracking and re-execution.
 *
 * Optimization: All properties are explicitly required to ensure monomorphic
 * access patterns in V8, maximizing throughput during graph traversal.
 *
 * Constraint: Internal fields such as `version`, `flags`, and `_lastSeenEpoch`
 * are managed exclusively by the engine and must not be mutated by external code.
 *
 * @internal
 */
export interface Dependency<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  /** The unique identifier for the dependency. */
  readonly id: DependencyId;

  /**
   * A monotonic counter incremented whenever the value is updated.
   * @internal
   */
  version: number;

  /**
   * A bitmask of internal state flags (e.g., DIRTY, DISPOSED).
   * @internal
   */
  flags: number;

  /**
   * The last epoch in which this node was visited during a tracking cycle.
   * @internal
   */
  _lastSeenEpoch: number;

  /** Indicates whether the node is a computed atom. */
  readonly isComputed: boolean;

  /** Indicates whether the node currently holds an error state. */
  readonly hasError: boolean;

  /**
   * Registers a subscriber for change notifications.
   * @internal
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /** Performs a non-reactive read. */
  peek(): T;

  /** Accesses the current value. */
  readonly value: T;
}

/** Configuration options for computed atoms. */
export interface ComputedOptions<T = unknown> {
  /** A human-readable name for diagnostic purposes. */
  name?: string;
  /** A custom equality function to determine if the computation result has meaningfully changed. */
  equal?: (a: T, b: T) => boolean;
  /** An initial value used until the first successful computation. */
  defaultValue?: T;
  /** If true, the computation is deferred until the value is accessed. */
  lazy?: boolean;
  /** An optional callback invoked when the computation encounters an error. */
  onError?: (error: Error) => void;
}

/**
 * Represents a derived reactive value that may resolve synchronously or asynchronously.
 *
 * When to use:
 * - To encapsulate results of complex selectors or asynchronous data fetching logic.
 * - To monitor the execution status and error state of derived data.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** @internal */
  readonly [BRAND]?: number;

  /** The current asynchronous state of the computation. */
  readonly state: AsyncStateType;
  /** Indicates whether the last computation cycle resulted in an error. */
  readonly hasError: boolean;
  /** The most recent error object encountered, if any. */
  readonly lastError: Error | null;

  /** True if the computation is currently in progress. */
  readonly isPending: boolean;
  /** True if the computation has successfully resolved at least once. */
  readonly isResolved: boolean;
  /** True if there is a valid value available (resolved and not in an error state). */
  readonly isValid: boolean;

  /**
   * A frozen list of all errors encountered during the last evaluation.
   * Useful for debugging multi-dependency computations.
   */
  readonly errors: readonly Error[];

  /**
   * Explicitly marks the computation as stale.
   *
   * When to use:
   * - To trigger a re-evaluation when external state not tracked by the engine has changed.
   */
  invalidate(): void;
}

/**
 * An interface for objects capable of being notified by the scheduler.
 * @internal
 */
export interface Subscriber {
  /** Performs the execution task. */
  execute(): void;
}

/** A function invoked to clean up side effects. */
export type EffectCleanup = () => void;

/**
 * The execution logic for a reactive effect.
 *
 * Supports returning an optional cleanup function or a Promise that resolves to one.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for TypeScript return type compatibility.
export type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;

/** Configuration options for reactive effects. */
export interface EffectOptions {
  /** A human-readable name for diagnostic purposes. */
  name?: string;
  /** If true, the effect executes synchronously upon creation. */
  sync?: boolean;
  /** The maximum number of executions permitted within a one-second window (loop protection). */
  maxExecutionsPerSecond?: number;
  /** The maximum number of executions allowed per scheduler flush cycle. */
  maxExecutionsPerFlush?: number;
  /** An optional callback for handling errors thrown during execution or cleanup. */
  onError?: (error: unknown) => void;
}

/**
 * A handle representing an active reactive effect.
 */
export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  /** Manually triggers the execution of the effect logic. */
  run(): void;
  /** Indicates whether the effect has been stopped and its resources released. */
  readonly isDisposed: boolean;
  /** The cumulative number of times the effect has executed. */
  readonly executionCount: number;
  /** Indicates whether the effect logic is currently in the execution phase. */
  readonly isExecuting: boolean;
}

/** Diagnostic statistics for internal resource pools. @internal */
export interface PoolStats {
  acquired: number;
  released: number;
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}

/**
 * The configuration interface for the global diagnostic controller.
 */
export interface DebugConfig {
  /** Enables or disables debugging features. */
  enabled: boolean;
  /** Enables or disables infinite loop warnings. */
  warnInfiniteLoop: boolean;
  /** Dispatches a warning message if the condition is met. */
  warn(condition: boolean, message: string): void;
  /** Attaches technical metadata to a reactive object. */
  attachDebugInfo(obj: object, type: string, id: number, customName?: string): void;
  /** Retrieves the debug name of an object. */
  getDebugName(obj: object | null | undefined): string | undefined;
  /** Retrieves the type identifier of an object. */
  getDebugType(obj: object | null | undefined): string | undefined;
  /** Records an update to a specific node for loop detection. */
  trackUpdate(id: DependencyId, name?: string): void;
  /** Registers a node in the internal graph registry. */
  registerNode(node: object & { id: DependencyId }): void;
  /** Generates a diagnostic snapshot of the reactive graph. */
  dumpGraph(): Record<string, unknown>[];
}
