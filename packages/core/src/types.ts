import type { AsyncState } from '@/constants';

/**
 * Dependency ID.
 */
export type DependencyId = number;

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
