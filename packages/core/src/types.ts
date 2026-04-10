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
 * Excludes prototype methods and stops at TerminalTypes.
 *
 * Used for `atomLens` to provide IDE autocomplete and type safety when
 * zooming into deeply nested reactive objects.
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
 * Uses NonNullable to correctly handle optional (?) or nullable properties.
 *
 * Works in tandem with `Paths<T>` to ensure that lensed atoms have
 * the correct inferred type for the member they point to.
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
   * Support for explicit resource management (TS 5.2+).
   */
  [Symbol.dispose](): void;
}

/**
 * Async state values.
 */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/**
 * Atom options.
 */
export interface AtomOptions {
  /** Optional name for debugging. */
  name?: string;
  /** If true, subscribers are notified synchronously. Default: false (microtask scheduled). */
  sync?: boolean;
}

/**
 * Readonly atom interface.
 */
export interface ReadonlyAtom<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  /** The current value of the atom. */
  readonly value: T;

  /**
   * Subscribes to value changes.
   * @param listener - Function called when value changes.
   * @returns Unsubscribe function.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void;

  /**
   * Non-reactive read.
   */
  peek(): T;

  /**
   * Returns the number of active subscribers.
   */
  subscriberCount(): number;
}

/**
 * Writable atom interface.
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T>, Disposable {
  value: T;
  /**
   * Cleans up the atom and releases resources.
   */
  dispose(): void;
  [Symbol.dispose](): void;
}

/**
 * Dependency interface.
 * Core contract for reactive nodes. All properties are required to ensure
 * high-performance access within the engine.
 *
 * @remarks
 * Internal fields (`version`, `flags`, `_lastSeenEpoch`) are part of the
 * engine contract between reactive nodes and must not be mutated externally.
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
 * Computed atom interface.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T>, Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  readonly state: AsyncStateType;
  readonly hasError: boolean;
  readonly lastError: Error | null;

  // Async status helpers
  readonly isPending: boolean;
  readonly isResolved: boolean;
  readonly isValid: boolean;

  /** List of errors encountered during computation. */
  readonly errors: readonly Error[];

  /** Invalidates atom. */
  invalidate(): void;
  dispose(): void;
  [Symbol.dispose](): void;
}

export interface Subscriber {
  execute(): void;
}

/**
 * Effect cleanup function.
 */
export type EffectCleanup = () => void;

/**
 * Effect function type.
 * Sync effects can return a cleanup function.
 * Async effects can return a promise that resolves to a cleanup function or void.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required here for TypeScript return type compatibility
export type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;

export interface EffectOptions {
  name?: string;
  sync?: boolean;
  maxExecutionsPerSecond?: number;
  maxExecutionsPerFlush?: number;
  onError?: (error: unknown) => void;
}

export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  dispose(): void;
  [Symbol.dispose](): void;
  run(): void;
  readonly isDisposed: boolean;
  readonly executionCount: number;
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
  trackUpdate(id: DependencyId): void;
}
