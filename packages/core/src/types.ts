/**
 * @module Types
 *
 * Responsibility:
 * Central entry point for all type definitions in the core reactive engine.
 * Consolidates all base, reactive, API, internal, error, debug, and scheduler types.
 */

import type { Equal, Merge, Prettify, Result, SlotBuffer } from '@but212/atom-effect-utils';
import type { AsyncState, BRAND, KIND, SCHEDULER_STATE } from '@/constants';
import type { AtomError } from '@/utils/errors';

/**
 * A process-local numeric identifier for reactive nodes.
 * Monotonicity and lifetime uniqueness are limited by the 31-bit SMI mask used by node ids.
 */
export type DependencyId = number;

/**
 * Represents an object identifiable by a process-local DependencyId, typically used in debugging/diagnostics.
 * @internal
 */
export type IdentifiableNode = object & { id: DependencyId };

/**
 * Interface for objects requiring explicit resource release.
 */
export interface Disposable {
  /**
   * Releases internal resources and detaches the node from the reactive graph.
   * After disposal, the object should be considered inactive.
   */
  dispose(): void;
}

/**
 * The union of all valid asynchronous lifecycle states.
 */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/**
 * Provides a structured JSON representation of an `AtomError` for cross-context
 * transport or persistence.
 */
export interface AtomErrorJSON {
  /** The specific name of the error class. */
  name: string;
  /** The human-readable error message. */
  message: string;
  /** Machine-readable error identifier for programmatic filtering. */
  code?: string | undefined;
  /**
   * When true, the reactive engine interprets the error as transient and may
   * attempt to re-execute the failed node during the next flush.
   */
  recoverable: boolean;
  /** Trace information. */
  stack?: string | undefined;
  /** The underlying cause resolved into a serializable plain object. */
  cause?: unknown | undefined;
}

/**
 * Configuration for Error Instantiation
 */
export interface AtomErrorOptions {
  /** The underlying cause of the error. */
  cause?: unknown;
  /**
   * If true, signals to the scheduler that the error is not terminal.
   */
  recoverable?: boolean | undefined;
  /** Unique category identifier for programmatic handling. */
  code?: string | undefined;
}

/**
 * Constructor signature for system-branded error classes.
 * @internal
 */
export type AtomErrorConstructor = new (message: string, options?: AtomErrorOptions) => AtomError;

/**
 * Represents any source of state that can be observed by subscribers.
 */
export interface Dependency<T = unknown> {
  /** @internal */
  readonly [BRAND]?: number;
  /** @internal */
  readonly id: DependencyId;
  /** @internal */
  version: number;
  /** @internal */
  flags: number;
  /** @internal */
  _lastSeenEpoch: number;
  /** @internal */
  _error?: Error | null;
  /** @internal */
  readonly isComputed: boolean;
  /** @internal */
  readonly hasError: boolean;
  /**
   * Establishes a link between this dependency and a subscriber.
   * Returns a cleanup handle to sever the connection.
   */
  subscribe(listener: SubscriberTarget<T>): () => void;
  /** Retrieves the value without triggering dependency tracking. */
  peek(): T;
  /** The current value of the node. */
  readonly value: T;
}

/**
 * A read-only reactive container.
 */
export interface ReadonlyAtom<T = unknown> extends Dependency<T>, Disposable {
  /** Returns the count of active listeners for diagnostic purposes. */
  subscriberCount(): number;
}

/**
 * A reactive container supporting read and write operations.
 */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Triggers a notification cycle to all dependent subscribers upon assignment. */
  value: T;
}

/**
 * Represents a value computed from other atoms or reactive nodes.
 */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** The current status in the asynchronous lifecycle. */
  readonly state: AsyncStateType;
  /** Indicates if the most recent computation resulted in an error. */
  readonly hasError: boolean;
  /** The specific Error object if `hasError` is true. */
  readonly lastError: Error | null;

  /** True while an asynchronous formula is executing. */
  readonly isPending: boolean;
  /** True if the node has resolved to a valid value at least once. */
  readonly isResolved: boolean;
  /** True if the most recent computation was rejected (async or sync). */
  readonly isRejected: boolean;
  /** True if the node has been permanently disposed. */
  readonly isDisposed: boolean;
  /** True if the current value is safe to read (resolved and error-free). */
  readonly isValid: boolean;

  /** The complete list of errors caught during the last evaluation batch. */
  readonly errors: readonly Error[];

  /**
   * Manually marks the node as stale, forcing it to re-evaluate on next access
   * regardless of dependency status.
   */
  invalidate(): void;
}

/**
 * Represents a target that can react to dependency changes.
 */
export interface Subscriber {
  /** Invoked by the scheduler to perform the node's update logic. */
  execute(): void;
  /** @internal Identifies computed nodes for synchronous dirty propagation. */
  readonly isComputed?: boolean;
}

/**
 * Provides control and diagnostic information for a running side-effect.
 */
export interface EffectObject extends Disposable {
  /** @internal */
  readonly [BRAND]?: number;
  /** Forces an immediate execution of the effect logic. */
  run(): void;
  /** Indicates if the effect has been permanently stopped. */
  readonly isDisposed: boolean;
  /** Cumulative count of executions used to detect runaway loops. */
  readonly executionCount: number;
  /** True while the user-provided effect function is actively running. */
  readonly isExecuting: boolean;
}

/**
 * Represents a single directed edge in the graph (Subscriber -> Dependency).
 * @internal
 */
export interface DependencyLink {
  /** The dependency node being observed. */
  node: Dependency;
  /** The version of the node when the link was established. */
  version: number;
  /** The unsubscription cleanup function. */
  unsubscribeCallback: (() => void) | undefined;
}

/**
 * Base structure for any reactive node containing properties independent of the value type.
 * @internal
 */
export interface ReactiveNodeBase {
  flags: number;
  version: number;
  _lastSeenEpoch: number;
  _error?: Error | null;
  readonly isRejected: boolean;
  readonly id: DependencyId;
  _kind?: typeof KIND.Obj | undefined;
  _subscriberSlots: unknown | null;
}

/**
 * The complete structure for a reactive node participating in the graph,
 * including listeners and upstream buffers.
 * @internal
 */
export interface ReactiveNode<T> extends ReactiveNodeBase {
  _subscriberSlots: SlotBuffer<SubscriberTarget<T>> | null;
}

/**
 * A reactive node that also tracks dependencies.
 * @internal
 */
export interface ReactiveDependencyTracker extends ReactiveNodeBase {
  _depSlots: SlotBuffer<DependencyLink>;
  _depFlags: number;
  _trackEpoch: number;
  _trackCount: number;
}

/**
 * Manages the global state of active computations to ensure correct
 * association between dependencies and their consumers.
 * @internal
 */
export interface TrackingContext {
  /** The stack of parent computations currently being evaluated. */
  stack: (DependencySubscriber | null)[];
  /** The current active subscriber recording dependencies. */
  current: DependencySubscriber | null;
}

/**
 * A node capable of recording reactive dependencies.
 * @internal
 */
export interface DependencySubscriber {
  /** Records a dependency in the current computation's tracking buffer. */
  addDependency(dependency: Dependency): void;
}

/**
 * A unified consumer that both tracks dependencies and executes logic.
 * @internal
 */
export interface DependencyTracker extends DependencySubscriber, Subscriber {}

/**
 * Supports both functional callbacks for external listeners and structured
 * `Subscriber` nodes for internal propagation.
 * @internal
 */
export type SubscriberTarget<T> = ((newValue?: T, oldValue?: T) => void) | Subscriber;

/**
 * Represents a reactive node or object that can be scheduled for execution.
 * @internal
 */
export interface SchedulerJobObject {
  /** The core logic to be executed when the job is flushed. */
  execute(): void;
  /** Tracks the scheduler epoch in which this job was last added. */
  _nextEpoch?: number | undefined;
  /** Discriminator used for low-overhead dispatching. */
  _kind?: typeof KIND.Obj | undefined;
}

/**
 * Represents a raw callback function that can be scheduled for execution.
 * @internal
 */
export interface SchedulerJobFunction {
  /** The core function logic to be executed. */
  (): void;
  /** Tracks the scheduler epoch to prevent duplicate scheduling. */
  _nextEpoch?: number | undefined;
  /** Discriminator used for low-overhead dispatching. */
  _kind?: typeof KIND.Fn | undefined;
}

/**
 * Unified type for any unit of work managed by the scheduler.
 * @internal
 */
export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

/**
 * A high-performance structure for batching scheduler jobs.
 * @internal
 */
export interface JobBuffer {
  /** Fixed-capacity array of jobs. */
  items: (SchedulerJob | undefined)[];
  /** Current number of active jobs in the buffer. */
  size: number;
}

/**
 * The complete internal state container for the reactive update scheduler.
 * @internal
 */
export interface SchedulerState {
  epoch: number;
  state: (typeof SCHEDULER_STATE)[keyof typeof SCHEDULER_STATE];
  batchDepth: number;
  maxFlushIterations: number;
  isSessionActive: boolean;
  sessionEpoch: number;
  sessionExecutionCount: number;
  queueSize: number;
  onOverflow: ((droppedCount: number, droppedJobs: SchedulerJob[]) => void) | null;
  nextEpoch(): number;
  startFlush(): boolean;
  endFlush(): void;
  incrementFlushExecutionCount(): Result<number, Error>;
  resetFlushState(): void;
  schedule(callback: SchedulerJob): Result<void, Error>;
  flushSync(): void;
  startBatch(): void;
  endBatch(): void;
}

/**
 * Global safety configuration parameters for the Scheduler.
 * @internal
 */
export interface SchedulerConfig {
  MAX_EXECUTIONS_PER_SECOND: number;
  MAX_EXECUTIONS_PER_EFFECT: number;
  MAX_EXECUTIONS_PER_FLUSH: number;
  MAX_FLUSH_ITERATIONS: number;
  MIN_FLUSH_ITERATIONS: number;
}

/**
 * Internal metadata container for reactive nodes.
 * @internal
 */
export interface NodeMetadata {
  name: string;
  type: string;
  ref?: WeakRef<object>;
  custom?: boolean;
}

/**
 * Internal interface for engine instrumentation and diagnostic hooks.
 * @internal
 */
export interface DebugConfig {
  isEnabled: boolean;
  shouldWarnInfiniteLoop: boolean;
  shouldTrackGraph: boolean;
  isWarningCondition(condition: boolean, message: string): void;
  attachDebugInfo(obj: IdentifiableNode, type: string, id: DependencyId, customName?: string): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
  trackUpdate(id: DependencyId, name?: string): void;
  registerNode(node: IdentifiableNode): void;
  trackEvaluationFailure(id: DependencyId): void;
  dumpGraph(): Record<string, unknown>[];
}

/**
 * Configuration for initializing a state source (Atom).
 */
export interface AtomOptions<T = unknown> {
  name?: string;
  sync?: boolean;
  equal?: (a: T, b: T) => boolean;
}

/**
 * Configuration for derived reactive values (Computed).
 */
export interface ComputedOptions<T = unknown> {
  name?: string;
  equal?: (a: T, b: T) => boolean;
  defaultValue?: T;
  lazy?: boolean;
  onError?: (error: Error) => void;
}

/**
 * A callback function to perform cleanup before the next effect run or upon disposal.
 */
export type EffectCleanup = () => void;

/**
 * The execution logic for a reactive side-effect.
 */
export type EffectFunction<T = void> = () => (T | EffectCleanup) | Promise<T | EffectCleanup>;

/**
 * Configuration for controlling reactive side-effects.
 */
export interface EffectOptions {
  name?: string;
  sync?: boolean;
  maxExecutionsPerSecond?: number;
  maxExecutionsPerFlush?: number;
  onError?: (error: unknown) => void;
}

/**
 * Extracts the underlying value type from a Dependency container.
 * @internal
 */
export type UnboxDependency<D> = D extends Dependency<infer V> ? V : never;

/**
 * Aggregates and merges the value types from an array of dependencies into a single object type.
 */
export type MergedDependencyValue<T extends readonly unknown[]> = Merge<UnboxDependency<T[number]>>;

export type { Equal, Merge, Prettify };
