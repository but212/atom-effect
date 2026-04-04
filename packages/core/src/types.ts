import type { AsyncState } from '@/constants';

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

/**
 * Generates a union of all possible dot-separated paths for a given type T.
 *
 * Used for `atomLens` to provide IDE autocomplete and type safety when
 * zooming into deeply nested reactive objects.
 *
 * @example
 * type User = { profile: { name: string } };
 * type P = Paths<User>; // "profile" | "profile.name"
 */
export type Paths<T, D extends unknown[] = []> = D['length'] extends MaxDepth
  ? never
  : T extends object
    ? {
        [K in keyof T & (string | number)]-?:
          | `${K}`
          | (T[K] extends object ? `${K}.${Paths<T[K], [...D, 1]>}` : never);
      }[keyof T & (string | number)]
    : never;

/**
 * Resolves the type of a value at a specific dot-path P within type T.
 *
 * Works in tandem with `Paths<T>` to ensure that lensed atoms have
 * the correct inferred type for the member they point to.
 */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? StringKeyToNumber<K> extends keyof T
    ? PathValue<T[StringKeyToNumber<K> & keyof T], Rest>
    : never
  : StringKeyToNumber<P> extends keyof T
    ? T[StringKeyToNumber<P> & keyof T]
    : never;

// ============================================================================
// Core Types
// ============================================================================

/**
 * Async state values.
 */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/**
 * Atom options.
 */
export interface AtomOptions {
  /** If true, subscribers are notified synchronously. Default: false (microtask scheduled). */
  sync?: boolean;
}

/**
 * Readonly atom interface.
 */
export interface ReadonlyAtom<T = unknown> {
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
}

/**
 * Dependency interface.
 *
 * @remarks
 * Internal fields (`version`, `flags`, `_lastSeenEpoch`) are part of the
 * engine contract between reactive nodes and must not be mutated externally.
 */
export interface Dependency {
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
  subscribe(listener: ((newValue?: unknown, oldValue?: unknown) => void) | Subscriber): () => void;

  /** Peek hook. */
  peek?(): unknown;

  /** Value accessor. */
  value?: unknown;
}

/**
 * Computed options.
 */
export interface ComputedOptions<T = unknown> {
  /** Equality check. */
  equal?: (a: T, b: T) => boolean;
  /** Initial value. */
  defaultValue?: T;
  /** Lazy evaluation. */
  lazy?: boolean;
  /** Error handler. */
  onError?: (error: Error) => void;
  /** Maximum number of async retries before giving up (default: 3). */
  maxAsyncRetries?: number;
}

/**
 * Computed atom interface.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T>, Disposable {
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
}

export interface Subscriber {
  execute(): void;
}

/**
 * Effect return type.
 */
export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;

export interface EffectOptions {
  name?: string;
  sync?: boolean;
  maxExecutionsPerSecond?: number;
  maxExecutionsPerFlush?: number;
  onError?: (error: unknown) => void;
}

export interface EffectObject extends Disposable {
  dispose(): void;
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
  attachDebugInfo(obj: object, type: string, id: number): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
}
