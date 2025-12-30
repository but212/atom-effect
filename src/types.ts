/**
 * @fileoverview Type definitions for reactive state management library
 * @description Core interfaces and types for atoms, computed values, and effects
 */

/**
 * Async computation state types
 *
 * Used by computed atoms to track the lifecycle of asynchronous computations.
 */
export type AsyncStateType = 'idle' | 'pending' | 'resolved' | 'rejected';

/**
 * Debug configuration interface
 *
 * Provides debugging utilities for development mode, including circular
 * dependency detection and large graph warnings.
 */
export interface DebugConfig {
  /** Whether debug mode is enabled (auto-enabled in NODE_ENV=development) */
  enabled: boolean;
  /** Maximum dependencies before warning about large dependency graphs */
  maxDependencies: number;
  /** Whether to warn about potential infinite loops */
  warnInfiniteLoop: boolean;
  /** Conditionally log warning messages */
  warn(condition: boolean, message: string): void;
  /** Check for circular dependencies in the dependency graph */
  checkCircular(dep: unknown, current: unknown, visited?: Set<unknown>): void;
  /** Attach debug metadata to reactive objects */
  attachDebugInfo(obj: object, type: string, id: number): void;
  /** Get debug name of a reactive object */
  getDebugName(obj: unknown): string | undefined;
  /** Get debug type of a reactive object */
  getDebugType(obj: unknown): string | undefined;
}

/**
 * Configuration options for atom creation
 */
export interface AtomOptions {
  /** If true, notify subscribers synchronously (default: false) */
  sync?: boolean;
}

/**
 * Configuration options for computed value creation
 *
 * @template T - Type of the computed value
 */
export interface ComputedOptions<T = unknown> {
  /** Custom equality function for change detection (default: Object.is) */
  equal?: (a: T, b: T) => boolean;
  /** Default value while async computation is pending */
  defaultValue?: T;
  /** If false, compute immediately instead of lazily (default: true) */
  lazy?: boolean;
  /** Error handler called when computation fails */
  onError?: (error: Error) => void;
}

/**
 * Interface for poolable objects
 *
 * Used by object pool to reuse objects and reduce GC pressure.
 */
export interface Poolable {
  /** Resets object to initial state for reuse */
  reset(): void;
}

/**
 * Subscriber interface for dependency notifications
 *
 * Used by computed values and effects to receive change notifications.
 */
export interface Subscriber {
  /** Called when dependencies change */
  execute(): void;
}

/**
 * Interface for subscribable dependencies
 *
 * Represents any reactive value (atom or computed) that can be
 * tracked as a dependency.
 */
export interface Dependency {
  /** Subscribe to changes in this dependency */
  subscribe(listener: (() => void) | Subscriber): () => void;
  /** Read value without tracking as dependency */
  peek?(): unknown;
  /** Current value (for atoms) */
  value?: unknown;
}

/**
 * WeakRef-based dependency entry structure
 *
 * Used internally by DependencyManager to enable automatic GC
 * while maintaining the ability to iterate over dependencies.
 *
 * @template T - Type of the dependency object (must be object for WeakRef)
 */
export interface DependencyEntry<T extends object = Dependency> {
  /** WeakRef to dependency (allows GC) */
  ref: WeakRef<T>;
  /** Function to unsubscribe from this dependency */
  unsubscribe: () => void;
}

/**
 * Configuration options for effect creation
 */
export interface EffectOptions {
  /** If true, run effect synchronously (default: false) */
  sync?: boolean;
  /** Maximum executions per second before warning (default: 100) */
  maxExecutionsPerSecond?: number;
  /** Track modifications to detect read-after-write patterns */
  trackModifications?: boolean;
}

/**
 * Read-only atom interface
 *
 * Provides read access and subscription to reactive state.
 * Used as the base for all reactive values.
 *
 * @template T - Type of the atom's value
 */
export interface ReadonlyAtom<T = unknown> {
  /** Current value (readonly) - automatically tracks dependencies when accessed */
  readonly value: T;
  /** Subscribe to value changes */
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void;
  /** Read value without tracking as dependency */
  peek(): T;
}

/**
 * Writable atom interface
 *
 * Extends ReadonlyAtom with write access and disposal.
 * Used for base reactive state containers.
 *
 * @template T - Type of the atom's value
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Current value (read/write) - setter notifies subscribers */
  value: T;
  /** Dispose atom and clean up all resources */
  dispose(): void;
}

/**
 * Computed atom interface
 *
 * Represents derived reactive state with automatic dependency tracking.
 * Supports both synchronous and asynchronous computations.
 *
 * @template T - Type of the computed value
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Current async state (idle, pending, resolved, rejected) */
  readonly state: AsyncStateType;
  /** Whether computation resulted in an error */
  readonly hasError: boolean;
  /** Last error that occurred during computation */
  readonly lastError: Error | null;
  /** Whether async computation is in progress */
  readonly isPending: boolean;
  /** Whether computation completed successfully */
  readonly isResolved: boolean;
  /** Invalidate cache and mark for recomputation */
  invalidate(): void;
  /** Dispose computed value and clean up all resources */
  dispose(): void;
}

/**
 * Effect object interface
 *
 * Represents a side effect with automatic dependency tracking.
 * Provides manual control over effect execution and disposal.
 */
export interface EffectObject {
  /** Dispose effect and clean up all resources */
  dispose(): void;
  /** Manually trigger effect execution */
  run(): void;
  /** Whether effect has been disposed */
  readonly isDisposed: boolean;
  /** Number of times effect has executed */
  readonly executionCount: number;
}

/**
 * Effect function type
 *
 * Can return:
 * - void: No cleanup needed
 * - Function: Cleanup function called before re-execution or disposal
 * - Promise<void | Function>: Async effect with optional async cleanup
 */
export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;

/**
 * Transform function type
 *
 * Used for deriving one value from another.
 *
 * @template T - Input type
 * @template U - Output type
 */
export type TransformFunction<T, U> = (value: T) => U;
