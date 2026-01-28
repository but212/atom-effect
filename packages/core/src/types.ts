import type { AsyncState } from '@/constants';
import type { DependencyLink } from '@/core/dep-tracking';

/**
 * Represents a brand for "Nominal Typing" to prevent accidental type aliasing.
 * @template T - The base type.
 * @template Brand - The unique brand string.
 */
export type Branded<T, Brand> = T & { readonly __brand: Brand };

/**
 * Unique identifier for dependencies in the reactive graph.
 * Uses nominal typing to prevent mixing up IDs with other numbers.
 */
export type DependencyId = Branded<number, 'DependencyId'>;

/**
 * Represents the async state enum values.
 */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/**
 * Common options for defining an Atom.
 */
export interface AtomOptions {
  /** If true, subscribers are notified synchronously. Default: false (microtask scheduled). */
  sync?: boolean;
}

/**
 * The fundamental unit of state.
 * @template T - The type of value held by the atom.
 */
export interface ReadonlyAtom<T = unknown> {
  /** The current value of the atom. */
  readonly value: T;

  /**
   * Subscribes to value changes.
   * @param listener - Function called when value changes.
   * @returns Unsubscribe function.
   */
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void;

  /**
   * Reads the value without registering a dependency (non-reactive read).
   */
  peek(): T;
}

/**
 * A mutable atom that can be updated.
 * @template T - The type of value held by the atom.
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  value: T;
  /**
   * Cleans up the atom and releases resources.
   */
  dispose(): void;
}

/**
 * Interface for objects that participate in the dependency graph.
 * This is the low-level contract for the reactivity engine.
 */
export interface Dependency {
  readonly id: DependencyId;

  /** Internal version counter for dirty checking. */
  version: number;

  /** Bitwise flags for state (DIRTY, PENDING, etc.). */
  flags: number;

  /** The epoch (global version) when this dependency was last fully validated. */
  _lastSeenEpoch: number;

  /** Temporary unsubscribe function used during graph tracking. */
  _tempUnsub?: (() => void) | undefined;

  /** The epoch when this dependency was last modified. */
  _modifiedAtEpoch?: number;

  /**
   * Adds a subscriber to this dependency.
   * @param listener - The subscriber (function or object with execute method).
   */
  subscribe(listener: (() => void) | Subscriber): () => void;

  /** Optional hook for non-reactive reads. */
  peek?(): unknown;

  /** Raw value accessor. */
  value?: unknown;
}

/**
 * Represents an entry in a Reactivity Graph.
 * Uses WeakRef to prevent memory leaks in the graph structure.
 */
export interface DependencyEntry<T extends object = Dependency> {
  /** Weak reference to the target dependency. */
  ref: WeakRef<T>;
  unsubscribe: () => void;
}

/**
 * Lightweight interface for object pooling.
 */
export interface Poolable {
  reset(): void;
}

/**
 * Configuration for Computed Atoms.
 */
export interface ComputedOptions<T = unknown> {
  /** Custom equality check to prevent unnecessary updates. */
  equal?: (a: T, b: T) => boolean;
  /** Initial value before first computation (mostly for async). */
  defaultValue?: T;
  /** If true, value is not computed until read. Default: false (eager). */
  lazy?: boolean;
  /** Error handler for computation failures. */
  onError?: (error: Error) => void;
}

/**
 * A Computed Atom (derived state).
 * Can be synchronous or asynchronous.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  readonly state: AsyncStateType;
  readonly hasError: boolean;
  readonly lastError: Error | null;

  // Async status helpers
  readonly isPending: boolean;
  readonly isResolved: boolean;
  readonly isValid: boolean;

  /** List of errors encountered during computation. */
  readonly errors: readonly Error[];

  /** Forces the computed to re-evaluate on next read. */
  invalidate(): void;
  dispose(): void;
}

/**
 * Context for a computation run.
 * Tracks dependencies accessed during execution.
 */
export interface ComputationContext {
  links: DependencyLink[];
}

export type TransformFunction<T, U> = (value: T) => U;

export interface Subscriber {
  execute(): void;
}

export interface IScheduler<T> {
  markDirty(atom: T): void;
  scheduleNotify(atom: T): void;
}

/**
 * Internal interface for atoms within the scheduler.
 */
export interface IAtom {
  readonly id: number;
  version: number;
  _internalNotifySubscribers(): void;
  recompute?(): void;
}

/**
 * Return type helper for effects.
 * Supports: void, cleanup function, or Promise (async effects).
 */
export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;

export interface EffectOptions {
  sync?: boolean;
  maxExecutionsPerSecond?: number;
  maxExecutionsPerFlush?: number;
  trackModifications?: boolean; // Useful for debugging side-effects
  onError?: (error: unknown) => void;
}

export interface EffectObject {
  dispose(): void;
  run(): void;
  readonly isDisposed: boolean;
  readonly executionCount: number;
}

export interface EffectExecutionContext {
  prevLinks: DependencyLink[];
  nextLinks: DependencyLink[];
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
  maxDependencies: number;
  warnInfiniteLoop: boolean;
  warn(condition: boolean, message: string): void;
  checkCircular(dep: Dependency, current: object): void;
  attachDebugInfo(obj: object, type: string, id: number): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
}
