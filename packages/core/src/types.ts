import type { AsyncState } from '@/constants';
import { BRAND } from '@/symbols';

/**
 * Dependency ID.
 */
export type DependencyId = number;

// ============================================================================
// Utility Types for Deep Nesting (Lenses)
// ============================================================================

/** Helper to convert numeric string to number for array indexing. */
export type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;

/** Max recursion depth for dot-paths. */
export type MaxDepth = 8;

/** Types that should be treated as terminals (no further path exploration). */
type TerminalTypes =
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | Promise<unknown>
  | Function;

/**
 * Generates a union of all possible dot-separated paths for a given type T.
 * Excludes prototype methods and stops at terminal types (Date, RegExp, etc.).
 *
 * When to use:
 * - Providing IDE autocomplete for deep object lensing in `atomLens`.
 * - Type-checking string paths used for state navigation.
 *
 * @example
 * ```typescript
 * type User = { profile: { name: string; avatar?: string } };
 * type UserPaths = Paths<User>; // "profile" | "profile.name" | "profile.avatar"
 * ```
 *
 * @public
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
 * Resolves the type of a value at a specific dot-path P within type T.
 *
 * Logic: Recursively follows the path P, handling optional and nullable
 * properties via `NonNullable` to ensure the most specific value type.
 *
 * Use this when:
 * - Inferring the expected type of a lensed atom's value.
 *
 * @example
 * ```typescript
 * type User = { profile: { name: string } };
 * type Name = PathValue<User, "profile.name">; // string
 * ```
 *
 * @public
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
 * Custom Disposable interface for explicit resource management.
 */
export interface Disposable {
  /**
   * Cleans up the object and releases resources.
   */
  dispose(): void;
  /**
   * Support for explicit resource management (TS 5.2+, ES2023).
   */
  // [Symbol.dispose](): void;
}

/**
 * Async state values.
 */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/**
 * Atom options.
 */
export interface AtomOptions<T = unknown> {
  /** Optional name for debugging. */
  name?: string;
  /** If true, subscribers are notified synchronously. Default: false (microtask scheduled). */
  sync?: boolean;
  /** Equality check. */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Readonly atom interface.
 * Represents a reactive container whose value can be observed but not directly mutated.
 *
 * When to use:
 * - Exposing state that should only be modified by specific logic (e.g. selectors).
 * - Passing state to UI components to enforce unidirectional data flow.
 *
 * @public
 */
export interface ReadonlyAtom<T = unknown> extends Disposable {
  /**
   * Internal brand marker.
   * @internal
   */
  readonly [BRAND]?: number;

  /** The current value of the atom. Accessing this triggers dependency collection if inside a reactive context. */
  readonly value: T;

  /**
   * Subscribes to value changes.
   *
   * @param listener - Function called when value changes.
   * @returns Unsubscribe function.
   *
   * @example
   * ```typescript
   * const unsub = atom.subscribe((val) => console.log(val));
   * unsub();
   * ```
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /**
   * Performs a non-reactive read that doesn't register a dependency.
   *
   * When to use:
   * - Accessing value in event handlers or logic where observation is not needed.
   */
  peek(): T;

  /**
   * Returns the number of active subscribers.
   */
  subscriberCount(): number;
}

/**
 * Writable atom interface.
 * Extends `ReadonlyAtom` to allow direct value assignment.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * count.value = 1; // Writable
 * ```
 *
 * @public
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  value: T;
}

/**
 * Low-level Dependency interface.
 * Core contract for all reactive nodes (Atoms, Computeds, Effects).
 *
 * @remarks
 * Properties are required (un-optional) at the interface level to ensure
 * monomorphic access in V8's hot paths.
 *
 * Constraint: Internal fields (`version`, `flags`, `_lastSeenEpoch`) must never
 * be mutated by user code.
 *
 * @internal
 */
export interface Dependency<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  readonly id: DependencyId;

  /**
   * Incremented whenever the dependency's value changes.
   * @internal
   */
  version: number;

  /**
   * Bitfield of internal state flags (e.g. DIRTY, DISPOSED, IS_COMPUTED).
   * @internal
   */
  flags: number;

  /**
   * Tracks the last epoch in which this dependency was visited during
   * dependency collection — used to deduplicate traversal.
   * @internal
   */
  _lastSeenEpoch: number;

  /**
   * Whether the dependency is a computed atom.
   * @internal
   */
  readonly isComputed: boolean;

  /**
   * Whether the dependency currently has an error.
   * @internal
   */
  readonly hasError: boolean;

  /**
   * Adds a subscriber to this dependency.
   * The listener may optionally receive the new and previous values.
   * @param listener - A callback or Subscriber object.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /**
   * Non-reactive read of the current value.
   */
  peek(): T;

  /**
   * Current value accessor.
   */
  readonly value: T;
}

/**
 * Computed options.
 */
export interface ComputedOptions<T = unknown> {
  /** Optional name for debugging. */
  name?: string;
  /** Equality check. */
  equal?: (a: T, b: T) => boolean;
  /** Initial value. */
  defaultValue?: T;
  /** Lazy evaluation. */
  lazy?: boolean;
  /** Error handler. */
  onError?: (error: Error) => void;
}

/**
 * Computed atom interface representing a derived, potentially asynchronous reactive value.
 *
 * When to use:
 * - Handling results of selectors or async functions.
 * - Inspecting error states or pending statuses of derived data.
 *
 * @public
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** @internal */
  readonly [BRAND]?: number;

  /** Current asynchronous state ('idle' | 'pending' | 'resolved' | 'rejected'). */
  readonly state: AsyncStateType;
  /** Whether the most recent computation resulted in an error. */
  readonly hasError: boolean;
  /** The most recent error encountered, if any. */
  readonly lastError: Error | null;

  /** Helper: True if a computation is currently in progress. */
  readonly isPending: boolean;
  /** Helper: True if the computation has successfully resolved at least once. */
  readonly isResolved: boolean;
  /** Helper: True if there is a valid value (resolved and not currently errored). */
  readonly isValid: boolean;

  /**
   * Aggregate list of all errors encountered during the last computation cycle.
   * Useful for debugging complex multi-dependency selectors.
   */
  readonly errors: readonly Error[];

  /**
   * Forces the computed atom to re-evaluate on its next access.
   *
   * Use this when:
   * - External state not tracked by the reactive system has changed.
   */
  invalidate(): void;
}

/**
 * Generic Subscriber interface for objects that can be notified by dependencies.
 * @internal
 */
export interface Subscriber {
  execute(): void;
}

/**
 * Effect cleanup function signature.
 */
export type EffectCleanup = () => void;

/**
 * Effect execution function type.
 * Supports both synchronous cleanups and asynchronous operations.
 *
 * @public
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required here for TypeScript return type compatibility
export type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;

/**
 * Configuration options for creating an effect.
 * @public
 */
export interface EffectOptions {
  /** Human-readable name for debugging. */
  name?: string;
  /** If true, the effect runs synchronously on the first execution. */
  sync?: boolean;
  /** Throttle: Maximum times the effect can run within a 1-second window. */
  maxExecutionsPerSecond?: number;
  /** Limit: Maximum iterations allowed within a single scheduler flush cycle. */
  maxExecutionsPerFlush?: number;
  /** Custom error handler for exceptions thrown during execution or cleanup. */
  onError?: (error: unknown) => void;
}

/**
 * Handle to an active reactive effect.
 *
 * @public
 */
export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  /** Manually triggers the effect execution. */
  run(): void;
  /** Whether the effect has been stopped and cleaned up. */
  readonly isDisposed: boolean;
  /** Total number of times this effect has executed since creation. */
  readonly executionCount: number;
  /** Whether the effect is currently running (useful for avoiding recursion). */
  readonly isExecuting: boolean;
}

export interface PoolStats {
  acquired: number;
  released: number;
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}

export interface DebugConfig {
  enabled: boolean;
  warnInfiniteLoop: boolean;
  warn(condition: boolean, message: string): void;
  attachDebugInfo(obj: object, type: string, id: number, customName?: string): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
  trackUpdate(id: DependencyId, name?: string): void;
  registerNode(node: object & { id: DependencyId }): void;
  dumpGraph(): Record<string, unknown>[];
}
