import type { AsyncState } from '@/constants';

/** Configuration options for creating an atom. */
export interface AtomOptions {
  /** If true, the atom will notify its subscribers synchronously when its value changes. */
  sync?: boolean;
}

/** Represents a read-only reactive atom. */
export interface ReadonlyAtom<T = unknown> {
  /** The current value of the atom. Accessing this tracks it as a dependency. */
  readonly value: T;
  /**
   * Subscribes a listener function to changes in the atom's value.
   * @param listener - Callback receiving both the new and old values.
   * @returns An unsubscribe function.
   */
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void;
  /** Returns the current value without registering it as a dependency. */
  peek(): T;
}

/** Represents a writable reactive atom. */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** The current value of the atom. Setting this will trigger notifications if the value changes. */
  value: T;
  /** Disposes of the atom and releases associated resources. */
  dispose(): void;
}
/**
 * Generic Branded Type helper.
 * T: The base type (e.g., number, string)
 * Brand: The unique brand tag
 */
export type Branded<T, Brand> = T & { readonly __brand: Brand };

/**
 * Unique identifier for reactive dependencies (Atoms, Computed, Effects).
 * Base type is number.
 */
export type DependencyId = Branded<number, 'DependencyId'>;

/**
 * Interface for poolable objects
 */
export interface Poolable {
  reset(): void;
}

/**
 * Subscriber interface for dependency notifications
 */
export interface Subscriber {
  execute(): void;
}

/**
 * Interface for subscribable dependencies
 */
export interface Dependency {
  readonly id: DependencyId;
  version: number;
  flags: number;
  /**
   * Last epoch seen by this dependency (used for invalidation)
   */
  _lastSeenEpoch: number;

  /**
   * Temporary field for O(N) sync strategy (avoiding Map/indexOf)
   * @internal
   */
  _tempUnsub?: (() => void) | undefined;

  /**
   * Epoch when this dependency was last modified (for debug/tracking)
   * @internal
   */
  _modifiedAtEpoch?: number;

  /**
   * Subscribe to dependency updates
   */
  subscribe(listener: (() => void) | Subscriber): () => void;

  /**
   * Peek at value without subscribing
   */
  peek?(): unknown;

  /**
   * Current value (if cached)
   */
  value?: unknown;
}

/**
 * WeakRef-based dependency entry structure
 */
export interface DependencyEntry<T extends object = Dependency> {
  ref: WeakRef<T>;
  unsubscribe: () => void;
}

/**
 * Debug configuration interface
 */
export interface DebugConfig {
  enabled: boolean;
  maxDependencies: number;
  warnInfiniteLoop: boolean;
  warn(condition: boolean, message: string): void;
  /** Checks for circular dependencies between reactive nodes */
  checkCircular(dep: Dependency, current: object): void;
  attachDebugInfo(obj: object, type: string, id: number): void;
  /** Returns debug name if available (requires obj to have DEBUG_NAME symbol) */
  getDebugName(obj: object | null | undefined): string | undefined;
  /** Returns debug type if available (requires obj to have DEBUG_TYPE symbol) */
  getDebugType(obj: object | null | undefined): string | undefined;
}

/**
 * Transform function type
 */
export type TransformFunction<T, U> = (value: T) => U;

/**
 * Context tracked during the computation phase of a reactive node.
 */
export interface ComputationContext {
  prevDeps: Dependency[];
  prevVersions: number[];
  nextDeps: Dependency[];
  nextVersions: number[];
  originalAdd: (dep: Dependency) => void;
  state: { depCount: number };
}

/** Type derived from AsyncState constant values */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/** Configuration options for creating a computed atom. */
export interface ComputedOptions<T = unknown> {
  /** Optional custom equality check for values. Defaults to `Object.is`. */
  equal?: (a: T, b: T) => boolean;
  /** Initial value to return while an async computation is pending. */
  defaultValue?: T;
  /** If true, the computation is deferred until the value is first accessed. */
  lazy?: boolean;
  /** Optional error handler for computation failures. */
  onError?: (error: Error) => void;
}

/** Represents a reactive atom whose value is derived from other reactive state. */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Current asynchronous state of the computation. */
  readonly state: AsyncStateType;
  /** true if self or any dependency has an error. */
  readonly hasError: boolean;
  /** The error object from the last failed computation, if any. */
  readonly lastError: Error | null;
  /** true if an asynchronous computation is currently in progress. */
  readonly isPending: boolean;
  /** true if the computation has successfully completed and has a value. */
  readonly isResolved: boolean;
  /** Accumulated errors from self and all dependencies (immutable). */
  readonly errors: readonly Error[];
  /** true if no errors in self or dependencies (inverse of hasError). */
  readonly isValid: boolean;
  /** Manually invalidates the cached value, forcing recomputation on next access. */
  invalidate(): void;
  /** Disposed of the computed atom and its subscriptions. */
  dispose(): void;
}

/**
 * Internal context used during effect execution to track dependency changes.
 * Bundles prev/next state for atomic lifecycle transitions.
 */
export interface EffectExecutionContext {
  prevDeps: Dependency[];
  prevVersions: number[];
  prevUnsubs: (() => void)[];
  nextDeps: Dependency[];
  nextVersions: number[];
  nextUnsubs: (() => void)[];
}

/** Configuration options for creating an effect. */
export interface EffectOptions {
  /** If true, the effect runs synchronously whenever its dependencies change. */
  sync?: boolean;
  /** Maximum number of executions allowed per second for rate limiting. */
  maxExecutionsPerSecond?: number;
  /** Maximum number of executions allowed per scheduler flush for loop detection. */
  maxExecutionsPerFlush?: number;
  /** If true, enables detection and warning for effects that modify their own dependencies. */
  trackModifications?: boolean;
  /** Callback function called when an execution error occurs (including async rejections). */
  onError?: (error: unknown) => void;
}

/** Represents a running effect instance. */
export interface EffectObject {
  /** Stops the effect and unsubscribes from all dependencies. */
  dispose(): void;
  /** Manually triggers an execution of the effect. */
  run(): void;
  /** true if the effect has been disposed. */
  readonly isDisposed: boolean;
  /** Number of times the effect has executed. */
  readonly executionCount: number;
}

/**
 * A function to be executed by an effect.
 * Can optionally return a cleanup function or a Promise that resolves to one.
 */
export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;
/** Internal scheduler interface to break circular dependencies. */
export interface IScheduler<T> {
  markDirty(atom: T): void;
  scheduleNotify(atom: T): void;
}

/** Internal atom interface for core library usage. */
export interface IAtom {
  /** Numerical ID for the node. */
  readonly id: number;
  /** Current version of the node's value. */
  version: number;
  /** Internal method to trigger subscriber notifications. */
  _internalNotifySubscribers(): void;
  /** Internal method to trigger recomputation. */
  recompute?(): void;
}

/** Statistics for pool usage and health. */
export interface PoolStats {
  /** Number of items acquired from the pool. */
  acquired: number;
  /** Number of items released back to the pool. */
  released: number;
  /** Details for items that could not be returned to the pool. */
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  /** Approximate number of items that have leaked (not released or rejected). */
  leaked: number;
  /** Current number of items available in the pool. */
  poolSize: number;
}
