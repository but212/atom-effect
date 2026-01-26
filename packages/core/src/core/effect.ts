import {
  COMPUTED_STATE_FLAGS,
  EFFECT_STATE_FLAGS,
  IS_DEV,
  NODE_FLAGS,
  SCHEDULER_CONFIG,
  TIME_CONSTANTS,
} from '@/constants';
import { ReactiveNode } from '@/core/base';
import { EffectError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import {
  flushEpoch,
  flushExecutionCount,
  incrementFlushExecutionCount,
  nextEpoch,
} from '@/internal/epoch';
import {
  depArrayPool,
  EMPTY_DEPS,
  EMPTY_UNSUBS,
  EMPTY_VERSIONS,
  unsubArrayPool,
  versionArrayPool,
} from '@/internal/pool';
import { scheduler } from '@/internal/scheduler';
import { type DependencyTracker, trackingContext, untracked } from '@/tracking';
import type {
  Dependency,
  EffectExecutionContext,
  EffectFunction,
  EffectObject,
  EffectOptions,
} from '@/types';
import { debug } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

/**
 * Internal effect implementation with dependency tracking and infinite loop detection.
 * Extends {@link ReactiveNode} and implements {@link EffectObject} and {@link DependencyTracker}.
 */

class EffectImpl extends ReactiveNode implements EffectObject, DependencyTracker {
  private _cleanup: (() => void) | null;
  private _dependencies: Dependency[];
  private _dependencyVersions: number[];
  private _unsubscribes: (() => void)[];
  private _nextDeps: Dependency[] | null;
  private _nextVersions: number[] | null;
  private _nextUnsubs: (() => void)[] | null;
  private _executeTask: (() => void) | undefined;

  private readonly _onError: ((error: unknown) => void) | null;

  private _currentEpoch: number;
  private _lastFlushEpoch: number;
  private _executionsInEpoch: number;

  private readonly _fn: EffectFunction;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;

  private _history: number[] | null;
  private _executionCount: number;
  private _historyPtr: number;
  private readonly _historyCapacity: number;
  private _execId: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();

    // V8 Hidden Class Stability: Group property initializations
    this._cleanup = null;
    this._dependencies = EMPTY_DEPS;
    this._dependencyVersions = EMPTY_VERSIONS;
    this._unsubscribes = EMPTY_UNSUBS;
    this._nextDeps = null;
    this._nextVersions = null;
    this._nextUnsubs = null;
    this._executeTask = undefined;
    this._onError = options.onError ?? null;

    this._currentEpoch = -1;
    this._lastFlushEpoch = -1;
    this._executionsInEpoch = 0;

    this._fn = fn;
    if (options.sync) {
      this.flags |= EFFECT_STATE_FLAGS.SYNC;
    }
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;
    if (options.trackModifications) {
      this.flags |= EFFECT_STATE_FLAGS.TRACK_MODIFICATIONS;
    }

    this._executionCount = 0;
    this._historyPtr = 0;

    const isFiniteLimit = Number.isFinite(this._maxExecutions);
    const capacity = isFiniteLimit
      ? Math.min(this._maxExecutions + 1, SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND + 1)
      : 0;
    this._historyCapacity = capacity;

    // Pre-allocate history buffer only if rate limiting is active and in Dev/Prod as configured
    this._history = IS_DEV && isFiniteLimit && capacity > 0 ? new Array(capacity).fill(0) : null;
    this._execId = 0;

    this.flags |= EFFECT_STATE_FLAGS.IS_EFFECT | EFFECT_STATE_FLAGS.IS_TRACKER;

    debug.attachDebugInfo(this, 'effect', this.id);
  }

  public run(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    // Force execution regardless of dependency versions
    this.execute(true);
  }

  public dispose(): void {
    const flags = this.flags;
    if (flags & EFFECT_STATE_FLAGS.DISPOSED) return;

    this.flags = flags | EFFECT_STATE_FLAGS.DISPOSED;
    this._safeCleanup();

    const unsubs = this._unsubscribes;
    if (unsubs !== EMPTY_UNSUBS) {
      for (let i = 0, len = unsubs.length; i < len; i++) {
        const unsub = unsubs[i];
        if (unsub) unsub();
      }
      unsubArrayPool.release(unsubs);
      this._unsubscribes = EMPTY_UNSUBS;
    }

    const deps = this._dependencies;
    if (deps !== EMPTY_DEPS) {
      depArrayPool.release(deps);
      this._dependencies = EMPTY_DEPS;
    }

    const versions = this._dependencyVersions;
    if (versions !== EMPTY_VERSIONS) {
      versionArrayPool.release(versions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }

    this._executeTask = undefined;
  }

  public addDependency(dep: Dependency): void {
    const flags = this.flags;
    // Guard: Only track if currently executing
    if (!(flags & EFFECT_STATE_FLAGS.EXECUTING)) return;

    const epoch = this._currentEpoch;
    if (dep._lastSeenEpoch === epoch) return;
    dep._lastSeenEpoch = epoch;

    const nextDeps = this._nextDeps;
    const nextVersions = this._nextVersions;
    const nextUnsubs = this._nextUnsubs;

    if (!nextDeps || !nextVersions || !nextUnsubs) return;

    nextDeps.push(dep);
    nextVersions.push(dep.version);

    const temp = dep._tempUnsub;
    if (temp) {
      nextUnsubs.push(temp);
      dep._tempUnsub = undefined;
    } else {
      this._subscribeTo(dep);
    }
  }

  public execute(force = false): void {
    const flags = this.flags;
    // Guard: Prevent re-entrant execution (infinite recursion) and post-disposal execution
    if (flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) return;
    if (!force && !this._shouldExecute()) return;

    this._checkInfiniteLoop();
    this._setExecuting(true);
    this._safeCleanup();

    const context = this._prepareEffectExecutionContext();
    let committed = false;

    try {
      const result = trackingContext.run(this, this._fn);

      // Commit Effect
      const trackedCount = context.nextDeps.length;
      context.nextDeps.length = trackedCount;
      context.nextVersions.length = trackedCount;

      this._dependencies = context.nextDeps;
      this._dependencyVersions = context.nextVersions;
      this._unsubscribes = context.nextUnsubs;
      committed = true;

      this._checkLoopWarnings();

      const execId = ++this._execId;

      if (isPromise(result)) {
        result
          .then((asyncCleanup) => {
            const isStale = execId !== this._execId;
            const isDisposed = this.flags & EFFECT_STATE_FLAGS.DISPOSED;

            if (isStale || isDisposed) {
              if (typeof asyncCleanup === 'function') {
                try {
                  asyncCleanup();
                } catch (error) {
                  this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
                }
              }
              return;
            }

            if (typeof asyncCleanup === 'function') {
              this._cleanup = asyncCleanup;
            }
          })
          .catch((error) => {
            if (execId === this._execId) {
              this._handleExecutionError(error);
            }
          });
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      // Dependencies were already committed before the callback threw
      committed = true;
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      this._cleanupEffect(context, committed);
      this._setExecuting(false);
    }
  }

  private _prepareEffectExecutionContext(): EffectExecutionContext {
    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const prevUnsubs = this._unsubscribes;
    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const nextUnsubs = unsubArrayPool.acquire();
    const epoch = nextEpoch();

    if (prevDeps !== EMPTY_DEPS) {
      for (let i = 0, len = prevDeps.length; i < len; i++) {
        const dep = prevDeps[i];
        if (dep) dep._tempUnsub = prevUnsubs[i];
      }
    }

    this._nextDeps = nextDeps;
    this._nextVersions = nextVersions;
    this._nextUnsubs = nextUnsubs;
    this._currentEpoch = epoch;

    return { prevDeps, prevVersions, prevUnsubs, nextDeps, nextVersions, nextUnsubs };
  }

  private _cleanupEffect(ctx: EffectExecutionContext, committed: boolean): void {
    this._nextDeps = null;
    this._nextVersions = null;
    this._nextUnsubs = null;

    const prevDeps = ctx.prevDeps;
    if (committed) {
      if (prevDeps !== EMPTY_DEPS) {
        for (let i = 0, len = prevDeps.length; i < len; i++) {
          const dep = prevDeps[i];
          const unsub = dep ? dep._tempUnsub : undefined;
          if (unsub) {
            unsub();
            if (dep) dep._tempUnsub = undefined;
          }
        }
        depArrayPool.release(prevDeps);
      }
      if (ctx.prevUnsubs !== EMPTY_UNSUBS) unsubArrayPool.release(ctx.prevUnsubs);
      if (ctx.prevVersions !== EMPTY_VERSIONS) versionArrayPool.release(ctx.prevVersions);
    } else {
      depArrayPool.release(ctx.nextDeps);
      versionArrayPool.release(ctx.nextVersions);
      const nextUnsubs = ctx.nextUnsubs;
      for (let i = 0, len = nextUnsubs.length; i < len; i++) {
        nextUnsubs[i]?.();
      }
      unsubArrayPool.release(nextUnsubs);

      if (prevDeps !== EMPTY_DEPS) {
        for (let i = 0, len = prevDeps.length; i < len; i++) {
          const dep = prevDeps[i];
          if (dep) dep._tempUnsub = undefined;
        }
      }
    }
  }

  private _subscribeTo(dep: Dependency): void {
    try {
      const unsubscribe = dep.subscribe(() => {
        if (
          this.flags & EFFECT_STATE_FLAGS.TRACK_MODIFICATIONS &&
          this.flags & EFFECT_STATE_FLAGS.EXECUTING
        ) {
          dep._modifiedAtEpoch = this._currentEpoch;
        }

        if (this.flags & EFFECT_STATE_FLAGS.SYNC) {
          this.execute();
          return;
        }

        let task = this._executeTask;
        if (!task) {
          task = this._executeTask = () => this.execute();
        }
        scheduler.schedule(task);
      });
      const nextUnsubs = this._nextUnsubs;
      if (nextUnsubs) {
        nextUnsubs.push(unsubscribe);
      }
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      const nextUnsubs = this._nextUnsubs;
      if (nextUnsubs) {
        nextUnsubs.push(() => {});
      }
    }
  }

  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  get executionCount(): number {
    return this._executionCount;
  }

  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  private _setExecuting(value: boolean): void {
    const mask = EFFECT_STATE_FLAGS.EXECUTING;
    this.flags = (this.flags & ~mask) | ((value ? -1 : 0) & mask);
  }

  private _safeCleanup(): void {
    const cleanup = this._cleanup;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
      }
      this._cleanup = null;
    }
  }

  private _checkInfiniteLoop(): void {
    const epoch = flushEpoch;
    if (this._lastFlushEpoch !== epoch) {
      this._lastFlushEpoch = epoch;
      this._executionsInEpoch = 0;
    }

    const count = ++this._executionsInEpoch;
    if (count > this._maxExecutionsPerFlush) {
      this._throwInfiniteLoopError('per-effect');
    }

    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._throwInfiniteLoopError('global');
    }

    this._executionCount++;

    const history = this._history;
    if (history) {
      const now = Date.now();
      const ptr = this._historyPtr;
      const capacity = this._historyCapacity;

      history[ptr] = now;
      const nextPtr = (ptr + 1) % capacity;
      this._historyPtr = nextPtr;

      const oldestTime = history[nextPtr] ?? 0;
      if (oldestTime > 0 && now - oldestTime < TIME_CONSTANTS.ONE_SECOND_MS) {
        const error = new EffectError(
          `Effect executed ${capacity} times within 1 second. Infinite loop suspected`
        );
        this.dispose();
        console.error(error);
        if (this._onError) this._onError(error);
        // Always halt execution after disposing, throw only in DEV for debugging
        if (IS_DEV) throw error;
        return;
      }
    }
  }

  private _throwInfiniteLoopError(type: 'per-effect' | 'global'): never {
    const error = new EffectError(
      `Infinite loop detected (${type}): ` +
        `effect executed ${this._executionsInEpoch} times in current flush. ` +
        `Total executions in flush: ${flushExecutionCount}`
    );
    this.dispose();
    console.error(error);
    throw error;
  }

  private _shouldExecute(): boolean {
    const deps = this._dependencies;
    const len = deps.length;
    if (len === 0) return true;

    const versions = this._dependencyVersions;
    for (let i = 0; i < len; i++) {
      const dep = deps[i];
      if (!dep) continue;

      if (dep.version !== versions[i]) return true;

      const flags = dep.flags;
      const isDirtyComputed =
        (flags & NODE_FLAGS.IS_COMPUTED) !== 0 && (flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;

      if (isDirtyComputed) {
        try {
          untracked(() => (dep as { value: unknown }).value);
          if (dep.version !== versions[i]) return true;
        } catch {
          return true;
        }
      }
    }

    return false;
  }

  private _handleExecutionError(
    error: unknown,
    message: string = ERROR_MESSAGES.EFFECT_EXECUTION_FAILED
  ): void {
    const errorObj = wrapError(error, EffectError, message);
    console.error(errorObj);

    const onError = this._onError;
    if (onError) {
      try {
        onError(errorObj);
      } catch (e) {
        // Avoid cascading failures if the onError handler itself throws
        console.error(wrapError(e, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER));
      }
    }
  }

  private _checkLoopWarnings(): void {
    if (this.flags & EFFECT_STATE_FLAGS.TRACK_MODIFICATIONS && debug.enabled) {
      const deps = this._dependencies;
      const epoch = this._currentEpoch;
      for (let i = 0, len = deps.length; i < len; i++) {
        const dep = deps[i];
        if (dep && dep._modifiedAtEpoch === epoch) {
          debug.warn(
            true,
            `Effect is reading a dependency (${
              debug.getDebugName(dep) || 'unknown'
            }) that it just modified. Infinite loop may occur`
          );
        }
      }
    }
  }
}

/**
 * Creates a reactive effect that re-executes when its dependencies change.
 *
 * An effect automatically tracks any reactive state (atoms, computed) accessed during its execution.
 * When those dependencies change, the effect is scheduled for re-execution.
 *
 * @param fn - The effect function to execute. Can return a cleanup function or a Promise that resolves to one.
 * @param options - Configuration options for the effect.
 * @param options.sync - If true, the effect runs synchronously when dependencies change. Defaults to false (scheduled).
 * @param options.maxExecutionsPerSecond - Rate limiting for the effect.
 * @param options.trackModifications - If true, warns when an effect modifies its own dependencies.
 * @returns An object representing the effect with `run()` and `dispose()` methods.
 * @throws {EffectError} If `fn` is not a function.
 *
 * @example
 * ```ts
 * const count = atom(0);
 * const stop = effect(() => {
 *   console.log('Count changed:', count.value);
 *   return () => console.log('Cleaning up...');
 * });
 * ```
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  effectInstance.execute();

  return effectInstance;
}
