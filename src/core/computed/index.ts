/**
 * @fileoverview computed: Derived reactive state with automatic dependency tracking
 * @description Creates computed values that automatically update when dependencies change (sync/async support)
 * @modularized Separated into focused modules for better maintainability
 */

import { ComputedError, isPromise } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { scheduler } from '../../scheduler';
import { trackingContext } from '../../tracking';
import { DependencyManager } from '../../tracking/dependency-manager';
import type { ComputedAtom, ComputedOptions, Dependency, Subscriber } from '../../types';
import { debug, generateId, NO_DEFAULT_VALUE } from '../../utils/debug';
import { SubscriberManager } from '../../utils/subscriber-manager';
import { AsyncComputationHandler, PromiseIdManager } from './computed-async-handler';
import { DependencySyncManager } from './computed-dependencies';
import {
  ComputationErrorHandler,
  StateValueHandlers,
  SyncComputationHandler,
} from './computed-handlers';
import { ComputedStateFlags } from './computed-state-flags';

/**
 * Creates a computed value that automatically tracks and reacts to dependencies
 *
 * Computed atoms are derived reactive state that:
 * - Automatically track dependencies accessed during computation
 * - Lazily recompute only when dependencies change (dirty checking)
 * - Support both synchronous and asynchronous computations
 * - Cache results until dependencies change (memoization)
 * - Use bit flags for efficient state management
 * - Provide async state tracking (idle/pending/resolved/rejected)
 *
 * @template T - The type of the computed value
 * @param fn - Computation function (can return T or Promise<T>)
 * @param options - Configuration options
 * @returns A readonly computed atom with automatic dependency tracking
 *
 * @example
 * ```ts
 * // Synchronous computed
 * const count = atom(0);
 * const doubled = computed(() => count.value * 2);
 *
 * // Asynchronous computed with default value
 * const userData = computed(
 *   async () => fetch(`/api/user/${userId.value}`).then(r => r.json()),
 *   { defaultValue: null }
 * );
 * ```
 */

// Function overloads
export function computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
export function computed<T>(
  fn: () => Promise<T>,
  options: ComputedOptions<T> & { defaultValue: T }
): ComputedAtom<T>;

// Implementation
export function computed<T>(
  fn: () => T | Promise<T>,
  options: ComputedOptions<T> = {}
): ComputedAtom<T> {
  if (typeof fn !== 'function') {
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
  }

  // ========================================
  // State Management
  // ========================================
  let value: T;
  let error: import('../../errors/errors').AtomError | null = null;

  const stateFlags = new ComputedStateFlags();
  const promiseIdManager = new PromiseIdManager();

  // ========================================
  // Options
  // ========================================
  const {
    equal = Object.is,
    defaultValue = NO_DEFAULT_VALUE as T,
    lazy = true,
    onError = null,
  } = options;

  const hasDefaultValue = StateValueHandlers.hasDefault(defaultValue);

  // ========================================
  // Subscribers
  // ========================================
  const functionSubscribers = new SubscriberManager<() => void>();
  const objectSubscribers = new SubscriberManager<Subscriber>();

  // ========================================
  // Dependencies
  // ========================================
  const dependencyManager = new DependencyManager();
  const id = generateId();

  // Forward declare computedObject for dependency tracking
  let computedObject: ComputedAtom<T>;

  // ========================================
  // Notification
  // ========================================
  const notifySubscribers = (): void => {
    if (!functionSubscribers.hasSubscribers && !objectSubscribers.hasSubscribers) {
      return;
    }

    scheduler.schedule(() => {
      functionSubscribers.forEachSafe(
        (subscriber) => subscriber(),
        (err) => console.error(err)
      );

      objectSubscribers.forEachSafe(
        (subscriber) => subscriber.execute(),
        (err) => console.error(err)
      );
    });
  };

  // ========================================
  // Handlers
  // ========================================
  const syncHandler = new SyncComputationHandler(stateFlags, equal, notifySubscribers);
  const errorHandler = new ComputationErrorHandler(stateFlags, onError);
  const stateValueHandlers = new StateValueHandlers(stateFlags, defaultValue, hasDefaultValue);

  const asyncHandler = new AsyncComputationHandler(
    stateFlags,
    promiseIdManager,
    equal,
    onError,
    notifySubscribers
  );

  // ========================================
  // Mark Dirty
  // ========================================
  const markDirty = (): void => {
    if (stateFlags.isRecomputing() || stateFlags.isDirty()) return;

    stateFlags.setDirty();
    stateFlags.setIdle();

    if (functionSubscribers.hasSubscribers || objectSubscribers.hasSubscribers) {
      scheduler.schedule(() => {
        if (stateFlags.isDirty()) {
          try {
            recompute();
          } catch {
            // Error already handled
          }
        }
      });
    }
  };

  // Dependency tracking integration (will be initialized after computedObject)
  let dependencySyncManager: DependencySyncManager;

  // ========================================
  // Recomputation
  // ========================================
  const recompute = (): void => {
    if (!stateFlags.isDirty() && stateFlags.isResolved()) {
      return;
    }

    stateFlags.setRecomputing(true);

    // Track dependencies during computation
    const newDependencies = new Set<unknown>();
    const tempMarkDirty = Object.assign(() => markDirty(), {
      addDependency: (dep: unknown) => newDependencies.add(dep),
    });

    try {
      const result = trackingContext.run(tempMarkDirty, fn);

      if (isPromise(result)) {
        // Update dependencies before async handling
        dependencySyncManager.update(newDependencies);
        asyncHandler.handle(
          result,
          () => value,
          (v) => {
            value = v;
          },
          (e) => {
            error = e;
          }
        );
        stateFlags.setRecomputing(false);
        return;
      }

      // Update dependencies for sync result
      dependencySyncManager.update(newDependencies);
      syncHandler.handle(
        result,
        () => value,
        (v) => {
          value = v;
        },
        (e) => {
          error = e;
        }
      );
    } catch (err) {
      // Update dependencies even on error for recovery support
      dependencySyncManager.update(newDependencies);
      errorHandler.handle(err, (e) => {
        error = e;
      });
    }
  };

  // ========================================
  // Value Computation
  // ========================================
  const computeValue = (): T => {
    if (stateFlags.isRecomputing()) return stateValueHandlers.handleRecomputing(value);
    if (stateFlags.isPending()) return stateValueHandlers.handlePending();
    if (stateFlags.isRejected()) return stateValueHandlers.handleRejected(error);

    if (stateFlags.isDirty() || stateFlags.isIdle()) {
      recompute();
      if (stateFlags.isPending()) {
        return stateValueHandlers.handlePending();
      }
    }

    return value;
  };

  // ========================================
  // Tracking Registration
  // ========================================
  const registerTracking = (): void => {
    const current = trackingContext.getCurrent();
    if (!current) return;

    if (typeof current === 'function') {
      functionSubscribers.add(current);
    } else if (current.addDependency) {
      current.addDependency(computedObject);
    } else if (current.execute) {
      objectSubscribers.add(current as Subscriber);
    }
  };

  // ========================================
  // Computed Object
  // ========================================
  computedObject = {
    get value(): T {
      // Fast path: resolved and not dirty
      if (stateFlags.isFastPath()) {
        registerTracking();
        return value;
      }

      // Slow path: state transition required
      const result = computeValue();
      registerTracking();
      return result;
    },

    subscribe(listener: () => void): () => void {
      if (typeof listener !== 'function') {
        throw new ComputedError(ERROR_MESSAGES.COMPUTED_SUBSCRIBER_MUST_BE_FUNCTION);
      }
      return functionSubscribers.add(listener);
    },

    peek(): T {
      return value;
    },

    get state() {
      return stateFlags.getAsyncState();
    },

    get hasError(): boolean {
      return stateFlags.isRejected();
    },

    get lastError(): Error | null {
      return error;
    },

    get isPending(): boolean {
      return stateFlags.isPending();
    },

    get isResolved(): boolean {
      return stateFlags.isResolved();
    },

    invalidate(): void {
      markDirty();
    },

    dispose(): void {
      dependencyManager.unsubscribeAll();
      functionSubscribers.clear();
      objectSubscribers.clear();
      stateFlags.reset();
      error = null;
      value = undefined as T;
      promiseIdManager.invalidate();
    },
  };

  // ========================================
  // Initialize Dependency Sync Manager (after computedObject is defined)
  // ========================================
  dependencySyncManager = new DependencySyncManager(dependencyManager, computedObject, markDirty);

  // Add dependency method for tracking context
  (markDirty as { addDependency?: (dep: unknown) => void }).addDependency = (
    dep: unknown
  ): void => {
    debug.checkCircular(dep, computedObject);
    dependencySyncManager.checkDependencyLimit();

    const unsubscribe = (dep as Dependency).subscribe(markDirty);
    dependencyManager.addDependency(dep as Dependency, unsubscribe);
  };

  // ========================================
  // Debug Info
  // ========================================
  debug.attachDebugInfo(computedObject, 'computed', id);

  if (debug.enabled) {
    const debugObj = computedObject as ComputedAtom<T> & {
      subscriberCount: () => number;
      isDirty: () => boolean;
      dependencies: ReturnType<typeof dependencyManager.getDependencies>;
      stateFlags: string;
    };
    debugObj.subscriberCount = () => functionSubscribers.size + objectSubscribers.size;
    debugObj.isDirty = () => stateFlags.isDirty();
    debugObj.dependencies = dependencyManager.getDependencies();
    debugObj.stateFlags = stateFlags.toString();
  }

  // ========================================
  // Initial Computation
  // ========================================
  if (!lazy) {
    try {
      recompute();
    } catch {
      // Ignore initial computation failure for non-lazy computed
    }
  }

  return computedObject;
}
