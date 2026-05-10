/**
 * Core Reactive Engine
 *
 * This module consolidates the internal tracking, scheduling, and subscription mechanisms.
 * It is designed to be the "heart" of the reactive system, ensuring:
 * 1. Glitch-free propagation via a unified scheduler.
 * 2. High performance through V8 SMI (Small Integer) and Hidden Class optimizations.
 * 3. Atomic state updates via batching.
 *
 * Boundaries:
 * - This module handles the execution flow but is agnostic to specific node implementations (Atoms/Computeds).
 * - All dependencies accessed here must be accessed synchronously.
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { AtomError, ERROR_MESSAGES, SchedulerError, wrapError } from '@/errors';
import type {
  Dependency,
  DependencyLink,
  DependencySubscriber,
  ReactiveNode,
  Subscriber,
} from '@/types';

/**
 * Subscriber Kind Discriminators
 * Reason: Using numeric flags instead of `typeof` or `instanceof` in hot loops
 * significantly improves JIT dispatch speed.
 * @internal
 */
const Kind = {
  Fn: 0,
  Obj: 1,
} as const;

/**
 * Wraps integers to stay within V8's SMI range (31-bit signed).
 *
 * Why: Transitioning from SMIs to HeapNumbers (doubles) causes significant
 * de-optimization in hot paths like version checking and epoch comparison.
 * @internal
 */
const nextSmi = (v: number): number => {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
};

/**
 * Generates the next version number for stateful objects.
 * Uses SMI-safe increments to prevent de-optimization.
 */
export function nextVersion(v: number): number {
  return nextSmi(v);
}

/**
 * Internal state for the reactive tracking system.
 *
 * Design: Stack-based approach enables nested tracking.
 * When a computed atom is evaluated inside an effect, the stack preserves
 * the effect's context while the computed atom tracks its own dependencies.
 * @internal
 */
export interface TrackingContext {
  stack: (DependencySubscriber | null)[];
  current: DependencySubscriber | null;
}

/** @internal */
export function createTrackingContext(): TrackingContext {
  return { stack: [], current: null };
}

/** @internal */
export function pushTrackingSubscriber(
  context: TrackingContext,
  subscriber: DependencySubscriber | null
): void {
  context.stack.push(subscriber);
  context.current = subscriber;
}

/** @internal */
export function popTrackingSubscriber(context: TrackingContext): void {
  const stack = context.stack;
  stack.pop();
  const len = stack.length;
  context.current = len > 0 ? stack[len - 1]! : null;
}

/**
 * Resets the tracking stack to a specific depth.
 *
 * Why: Used during error recovery to prevent dependency leakage if a
 * computation fails mid-execution.
 * @internal
 */
export function rollbackTrackingSubscriber(context: TrackingContext, depth: number): void {
  const stack = context.stack;
  stack.length = depth;
  const len = stack.length;
  context.current = len > 0 ? stack[len - 1]! : null;
}

/**
 * Executes a function within the scope of a specific subscriber.
 * @internal
 */
export function runInTrackingContext<T>(
  context: TrackingContext,
  subscriber: DependencySubscriber,
  fn: () => T
): T {
  // Optimization: Skip stack operations if already in the same context.
  if (context.current === subscriber) return fn();

  pushTrackingSubscriber(context, subscriber);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(context);
  }
}

/** @internal */
export function resetTrackingContext(context: TrackingContext): void {
  context.stack.length = 0;
  context.current = null;
}

export const trackingContext = createTrackingContext();

/**
 * Executes a scope where reactive dependencies are ignored.
 *
 * When to use:
 * - Accessing atoms inside an effect/computed without creating a subscription.
 * - Side-effects (logging, analytics) that shouldn't trigger re-runs.
 * - Breaking circular dependencies by reading a value "silently".
 *
 * Example:
 * ```ts
 * effect(() => {
 *   const val = count.value; // Tracked
 *   untracked(() => console.log('Current value:', count.value)); // Not tracked
 * });
 * ```
 */
export function untracked<T>(fn: () => T): T {
  if (trackingContext.current === null) return fn();

  pushTrackingSubscriber(trackingContext, null);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(trackingContext);
  }
}

/** @internal */
export function createDependencyLink(
  node: Dependency,
  version: number,
  unsub: (() => void) | undefined = undefined
): DependencyLink {
  return { node, version, unsub };
}

/**
 * Internal subscription record.
 * Using Kind-based dispatch for performance.
 * @internal
 */
export interface Subscription<T> {
  readonly k: number;
  readonly t: ((newValue?: T, oldValue?: T) => void) | Subscriber;
}

/** @internal */
export function createSubscription<T>(
  k: number,
  t: ((newValue?: T, oldValue?: T) => void) | Subscriber
): Subscription<T> {
  return { k, t };
}

/**
 * Notifies a subscriber of a change.
 * Failure Isolation: Errors in one subscriber do not stop the notification of others.
 * @internal
 */
export function notifySubscription<T>(
  subscription: Subscription<T>,
  newValue?: T,
  oldValue?: T
): void {
  try {
    if (subscription.k === Kind.Fn) {
      (subscription.t as (n?: T, o?: T) => void)(newValue, oldValue);
    } else {
      (subscription.t as Subscriber).execute();
    }
  } catch (e) {
    console.error('[atom-effect] Subscriber failed:', e);
  }
}

export interface SchedulerJobObject {
  execute(): void;
  _nextEpoch?: number | undefined;
  _k?: number | undefined;
}

export interface SchedulerJobFunction {
  (): void;
  _nextEpoch?: number | undefined;
  _k?: number | undefined;
}

export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

const S_IDLE = 0;
const S_PROCESSING = 1 << 0;
const S_FLUSHING_SYNC = 1 << 1;
const S_BATCHING = 1 << 2;

/** @internal */
export interface JobBuffer {
  items: (SchedulerJob | undefined)[];
  size: number;
}

/**
 * Internal Scheduler State
 *
 * Managed via multiple buffers to allow "Double-Buffering" during flushes.
 * @internal
 */
export interface SchedulerState {
  epoch: number;
  state: number;
  batchDepth: number;
  maxFlushIterations: number;
  sessionActive: boolean;
  sessionEpoch: number;
  sessionExecutionCount: number;
  active: JobBuffer; // Queue for the current flush.
  standby: JobBuffer; // Collects jobs scheduled during an active flush.
  batch: JobBuffer; // Collects jobs scheduled during an active batch.
  _current: JobBuffer;
  onOverflow: ((droppedCount: number) => void) | null;
}

/** @internal */
export function createSchedulerState(): SchedulerState {
  const active = { items: [], size: 0 };
  const standby = { items: [], size: 0 };
  const batch = { items: [], size: 0 };
  return {
    epoch: 0,
    state: S_IDLE,
    batchDepth: 0,
    maxFlushIterations: SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS,
    sessionActive: false,
    sessionEpoch: 0,
    sessionExecutionCount: 0,
    active,
    standby,
    batch,
    _current: active,
    onOverflow: null,
  };
}

/**
 * Consolidation: Moves batch jobs to the active execution queue.
 * @internal
 */
export function schedulerMergeBatchQueue(state: SchedulerState, nextEpoch: () => number): void {
  const batch = state.batch;
  const queueSize = batch.size;
  if (queueSize === 0) return;

  const epoch = nextEpoch();
  const bItems = batch.items;
  const active = state.active;
  const targetItems = active.items;
  let currentSize = active.size;

  for (let i = 0; i < queueSize; i++) {
    const job = bItems[i]!;
    if (job._nextEpoch !== epoch) {
      job._nextEpoch = epoch;
      targetItems[currentSize++] = job;
    }
    bItems[i] = undefined;
  }

  active.size = currentSize;
  batch.size = 0;

  // Cleanup: Shrink buffer if it grew significantly beyond threshold.
  if (bItems.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
    bItems.length = 0;
  }
}

/**
 * Drainage: Loops until all buffers are empty.
 * Caution: Subject to maxFlushIterations to prevent infinite recursion in circular graphs.
 * @internal
 */
export function schedulerDrainQueue(
  state: SchedulerState,
  nextEpoch: () => number,
  processQueue: (state: SchedulerState) => void,
  handleOverflow: (state: SchedulerState) => void
): void {
  let iterations = 0;
  const max = state.maxFlushIterations;

  while (state.active.size > 0 || state.batch.size > 0) {
    if (++iterations > max) {
      handleOverflow(state);
      return;
    }

    if (state.batch.size > 0) {
      schedulerMergeBatchQueue(state, nextEpoch);
    }

    if (state.active.size > 0) {
      processQueue(state);
    }
  }
}

/**
 * Execution: Swaps buffers to allow new jobs to be safely queued during execution.
 * @internal
 */
export function schedulerProcessQueue(state: SchedulerState, nextEpoch: () => number): void {
  const active = state.active;
  const jobs = active.items;
  const count = active.size;

  // Double-buffering swap: active becomes standby (cleared), standby becomes active.
  state.active = state.standby;
  state.standby = active;
  state.active.size = 0;
  if (state._current === active) state._current = state.active;

  nextEpoch();

  for (let i = 0; i < count; i++) {
    const job = jobs[i]!;
    jobs[i] = undefined;

    try {
      const k = job._k!;
      if (k === Kind.Fn) {
        (job as () => void)();
      } else {
        (job as SchedulerJobObject).execute();
      }
    } catch (e) {
      console.error(new SchedulerError('Error occurred during scheduler execution', e));
    }
  }
}

/**
 * Recovery: Clears state when an infinite loop is detected.
 * @internal
 */
export function schedulerHandleFlushOverflow(state: SchedulerState): void {
  const droppedCount = state.active.size + state.batch.size;
  console.error(
    new SchedulerError(
      ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(state.maxFlushIterations, droppedCount)
    )
  );

  state.active.size = 0;
  state.active.items.length = 0;
  state.standby.size = 0;
  state.standby.items.length = 0;
  state.batch.size = 0;
  state.batch.items.length = 0;

  if (state.onOverflow) {
    try {
      state.onOverflow(droppedCount);
    } catch {
      /* Suppress user callback errors */
    }
  }
}

/** @internal */
export function schedulerNextEpoch(state: SchedulerState): number {
  state.epoch = nextSmi(state.epoch);
  return state.epoch;
}

/** @internal */
export function schedulerStartFlush(state: SchedulerState): boolean {
  if (state.sessionActive) {
    if (IS_DEV) console.warn('startFlush() called during flush - ignored');
    return false;
  }
  state.sessionActive = true;
  state.sessionEpoch = schedulerNextEpoch(state);
  state.sessionExecutionCount = 0;
  return true;
}

/** @internal */
export function schedulerEndFlush(state: SchedulerState): void {
  state.sessionActive = false;
}

/** @internal */
export function schedulerIncrementFlushExecutionCount(state: SchedulerState): number {
  if (!state.sessionActive) return 0;
  const count = ++state.sessionExecutionCount;
  if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) return count;

  throw new Error(`[atom-effect] Infinite loop detected: limit exceeded.`);
}

/** @internal */
export function schedulerResetFlushState(state: SchedulerState): void {
  state.sessionEpoch = 0;
  state.sessionExecutionCount = 0;
  state.sessionActive = false;
}

/**
 * Entry point for scheduling jobs.
 * Uses microtasks for deferred execution by default.
 * @internal
 */
export function schedulerSchedule(state: SchedulerState, callback: SchedulerJob): void {
  if (IS_DEV) {
    if (
      typeof callback !== 'function' &&
      (!callback || typeof (callback as SchedulerJobObject).execute !== 'function')
    ) {
      throw new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION);
    }
  }

  // Deduplication: Avoid scheduling the same job twice in the same epoch.
  if (callback._nextEpoch === state.epoch) return;
  callback._nextEpoch = state.epoch;

  if (callback._k === undefined) {
    callback._k = typeof callback === 'function' ? Kind.Fn : Kind.Obj;
  }

  const target = state._current;
  target.items[target.size++] = callback;

  if ((state.state & S_PROCESSING) === 0) {
    state.state |= S_PROCESSING;
    queueMicrotask(() => {
      try {
        if (state.active.size === 0 && state.batch.size === 0) return;
        const started = schedulerStartFlush(state);
        schedulerDrainQueue(
          state,
          () => schedulerNextEpoch(state),
          (s) => schedulerProcessQueue(s, () => schedulerNextEpoch(s)),
          (s) => schedulerHandleFlushOverflow(s)
        );
        if (started) schedulerEndFlush(state);
      } catch (e) {
        resetTrackingContext(trackingContext);
        throw e;
      } finally {
        state.state &= ~S_PROCESSING;
      }
    });
  }
}

/** @internal */
export function schedulerFlushSync(state: SchedulerState): void {
  if (state.active.size === 0 && state.batch.size === 0) return;

  const prevState = state.state;
  state.state |= S_FLUSHING_SYNC;
  const started = schedulerStartFlush(state);
  try {
    schedulerMergeBatchQueue(state, () => schedulerNextEpoch(state));
    schedulerDrainQueue(
      state,
      () => schedulerNextEpoch(state),
      (s) => schedulerProcessQueue(s, () => schedulerNextEpoch(s)),
      (s) => schedulerHandleFlushOverflow(s)
    );
  } finally {
    state.state = prevState;
    if (started) schedulerEndFlush(state);
  }
}

/** @internal */
export function schedulerStartBatch(state: SchedulerState): void {
  state.batchDepth++;
  state.state |= S_BATCHING;
  state._current = state.batch;
}

/** @internal */
export function schedulerEndBatch(state: SchedulerState): void {
  if (state.batchDepth === 0) {
    if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
    return;
  }

  if (--state.batchDepth === 0) {
    state.state &= ~S_BATCHING;
    state._current = state.active;
    if ((state.state & S_FLUSHING_SYNC) === 0) {
      schedulerFlushSync(state);
    }
  }
}

/** @internal */
export function schedulerSetMaxFlushIterations(state: SchedulerState, max: number): void {
  if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS) throw new SchedulerError(`Invalid limit.`);
  state.maxFlushIterations = max;
}

/** @internal */
export function schedulerIsBatching(state: SchedulerState): boolean {
  return (state.state & S_BATCHING) !== 0;
}

/** @internal */
export function schedulerQueueSize(state: SchedulerState): number {
  return state.active.size + state.batch.size;
}

export const scheduler = createSchedulerState();

export const nextEpoch = (): number => schedulerNextEpoch(scheduler);
export const currentEpoch = (): number => scheduler.epoch;
export const currentFlushEpoch = (): number => scheduler.sessionEpoch;
export const startFlush = (): boolean => schedulerStartFlush(scheduler);
export const endFlush = (): void => schedulerEndFlush(scheduler);
export const incrementFlushExecutionCount = (): number =>
  schedulerIncrementFlushExecutionCount(scheduler);
export const resetFlushState = (): void => schedulerResetFlushState(scheduler);

/**
 * Groups multiple updates into a single atomic change.
 * Affected effects/computeds are flushed synchronously after the callback.
 *
 * Example:
 * ```ts
 * batch(() => {
 *   atomA.value = 1;
 *   atomB.value = 2;
 * }); // Sync flush happens here.
 * ```
 */
export function batch<T>(fn: () => T): T {
  if (IS_DEV && typeof fn !== 'function')
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);

  schedulerStartBatch(scheduler);
  try {
    return fn();
  } finally {
    schedulerEndBatch(scheduler);
  }
}

/** @internal */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  const started = startFlush();
  try {
    return fn();
  } finally {
    if (started) endFlush();
  }
}

let sharedNextTickPromise: Promise<void> | null = null;

/**
 * Returns a promise that resolves after the next scheduler flush.
 * Useful for awaiting side-effects in tests.
 *
 * Example:
 * ```ts
 * atom.value = 100;
 * await aeNextTick(); // Wait for effects to run.
 * ```
 */
export function aeNextTick(fn?: () => void): Promise<void> {
  if (fn) {
    return new Promise<void>((resolve, reject) => {
      schedulerSchedule(scheduler, () => {
        try {
          fn();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  if (sharedNextTickPromise) return sharedNextTickPromise;

  sharedNextTickPromise = new Promise<void>((resolve) => {
    schedulerSchedule(scheduler, () => {
      sharedNextTickPromise = null;
      resolve();
    });
  });

  return sharedNextTickPromise;
}

/**
 * Registers a subscriber to a reactive node.
 *
 * Performance: Uses a SlotBuffer to manage listeners, allowing O(1) removals.
 * @internal
 */
export function nodeSubscribe<T>(
  node: ReactiveNode<T>,
  listener: ((newValue?: T, oldValue?: T) => void) | Subscriber
): () => void {
  let link: Subscription<T> | undefined;

  if (typeof listener === 'function') {
    link = createSubscription(Kind.Fn, listener as (n?: T, o?: T) => void);
  } else if (listener != null && typeof (listener as Subscriber).execute === 'function') {
    link = createSubscription(Kind.Obj, listener as Subscriber);
  }

  if (!link)
    throw wrapError(
      new TypeError('Invalid subscriber'),
      AtomError,
      ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
    );

  let slots = node._storage.slots;
  if (slots === null) {
    node._storage.slots = slots = new SlotBuffer<Subscription<T>>();
  } else if (nodeHasSubscription(node, listener)) {
    if (IS_DEV) console.warn(`[atom-effect] Duplicate subscription ignored on node ${node.id}`);
    return () => {}; // Deduplication
  }

  slots.push(link);
  return () => nodeUnsubscribe(node, link as Subscription<T>);
}

/** @internal */
export function nodeUnsubscribe<T>(node: ReactiveNode<T>, link: Subscription<T>): void {
  const slots = node._storage.slots;
  if (slots === null) return;

  slots.remove(link);
  slots.compact();
}

/**
 * Notifies all subscribers of a node.
 *
 * Safety: Locks the SlotBuffer during iteration to prevent index shifting
 * if a subscriber unsubscribes itself during the notification.
 * @internal
 */
export function nodeNotifySubscribers<T>(
  node: ReactiveNode<T>,
  newValue: T | undefined,
  oldValue: T | undefined
): void {
  const slots = node._storage.slots;
  if (slots === null || slots.size === 0) return;

  const ctx = trackingContext;
  const isUntracked = ctx.current === null;
  const depth = ctx.stack.length;

  if (!isUntracked) pushTrackingSubscriber(ctx, null);

  slots.lock();
  try {
    slots.forEach((sub) => {
      notifySubscription(sub, newValue, oldValue);
    });
  } finally {
    if (!isUntracked) rollbackTrackingSubscriber(ctx, depth);
    slots.unlock();
  }
}

/**
 * Checks for duplicate listeners.
 * @internal
 */
export function nodeHasSubscription<T>(node: ReactiveNode<T>, listener: unknown): boolean {
  const slots = node._storage.slots;
  if (slots === null || slots.size === 0) return false;
  return slots.some((link) => link.t === listener);
}
