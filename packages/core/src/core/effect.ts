import { EFFECT_STATE_FLAGS, IS_DEV, SCHEDULER_CONFIG, TIME_CONSTANTS } from '@/constants';
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
import type { Dependency, EffectFunction, EffectObject, EffectOptions } from '@/types';
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
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;
  private readonly _trackModifications: boolean;

  private _history: number[] | null;
  private _executionCount: number;
  private _historyPtr: number;
  private readonly _historyCapacity: number;
  private _execId: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();

    // V8 Hidden Class Stability
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
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;
    this._trackModifications = options.trackModifications ?? false;

    this._executionCount = 0;
    this._historyPtr = 0;

    const isFiniteLimit = Number.isFinite(this._maxExecutions);
    const capacity = isFiniteLimit
      ? Math.min(this._maxExecutions + 1, SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND + 1)
      : 0;
    this._historyCapacity = capacity;
    this._history = IS_DEV && isFiniteLimit && capacity > 0 ? new Array(capacity).fill(0) : null;
    this._execId = 0;

    debug.attachDebugInfo(this, 'effect', this.id);
  }

  public run(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    this.execute(true);
  }

  public dispose(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED) return;

    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    if (this._cleanup) {
      try {
        this._cleanup();
      } catch (error) {
        this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
      }
      this._cleanup = null;
    }

    const unsubs = this._unsubscribes;
    if (unsubs !== EMPTY_UNSUBS) {
      for (let i = 0, len = unsubs.length; i < len; i++) {
        unsubs[i]!();
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
    if (!(this.flags & EFFECT_STATE_FLAGS.EXECUTING)) return;

    const epoch = this._currentEpoch;
    if (dep._lastSeenEpoch === epoch) return;
    dep._lastSeenEpoch = epoch;

    const nextDeps = this._nextDeps!;
    const nextVersions = this._nextVersions!;
    const nextUnsubs = this._nextUnsubs!;

    nextDeps.push(dep);
    nextVersions.push(dep.version);

    if (dep._tempUnsub) {
      nextUnsubs.push(dep._tempUnsub);
      dep._tempUnsub = undefined;
    } else {
      try {
        const unsubscribe = dep.subscribe(() => {
          if (this._trackModifications && this.flags & EFFECT_STATE_FLAGS.EXECUTING) {
            dep._modifiedAtEpoch = this._currentEpoch;
          }

          if (this._sync) {
            this.execute();
          } else {
            if (!this._executeTask) {
              this._executeTask = () => this.execute();
            }
            scheduler.schedule(this._executeTask);
          }
        });
        nextUnsubs.push(unsubscribe);
      } catch (error) {
        console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
        nextUnsubs.push(() => {});
      }
    }
  }

  public execute(force = false): void {
    const flags = this.flags;
    if (flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) return;

    // Check if execution is needed
    if (!force) {
      const deps = this._dependencies;
      const len = deps.length;
      if (len > 0) {
        const versions = this._dependencyVersions;
        let dirty = false;
        for (let i = 0; i < len; i++) {
          const dep = deps[i];
          if (!dep) continue;
          if (dep.version !== versions[i]) {
            dirty = true;
            break;
          }
          if ('value' in dep) {
            try {
              untracked(() => (dep as { value: unknown }).value);
              if (dep.version !== versions[i]) {
                dirty = true;
                break;
              }
            } catch {
              dirty = true;
              break;
            }
          }
        }
        if (!dirty) return;
      }
    }

    // Infinite Loop & Rate Limit Check
    const epoch = flushEpoch;
    if (this._lastFlushEpoch !== epoch) {
      this._lastFlushEpoch = epoch;
      this._executionsInEpoch = 0;
    }

    if (++this._executionsInEpoch > this._maxExecutionsPerFlush) {
      this._throwInfiniteLoopError('per-effect');
    }

    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._throwInfiniteLoopError('global');
    }

    this._executionCount++;

    if (this._history) {
      const now = Date.now();
      const ptr = this._historyPtr;
      this._history[ptr] = now;
      this._historyPtr = (ptr + 1) % this._historyCapacity;

      const oldestTime = this._history[this._historyPtr] ?? 0;
      if (oldestTime > 0 && now - oldestTime < TIME_CONSTANTS.ONE_SECOND_MS) {
        const error = new EffectError(
          `Effect executed ${this._historyCapacity} times within 1 second. Infinite loop suspected`
        );
        this.dispose();
        console.error(error);
        if (this._onError) this._onError(error);
        if (IS_DEV) throw error;
        return;
      }
    }

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;

    if (this._cleanup) {
      try {
        this._cleanup();
      } catch (error) {
        this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
      }
      this._cleanup = null;
    }

    // Prepare Execution Context
    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const prevUnsubs = this._unsubscribes;

    // reuse tempUnsub mechanism
    if (prevDeps !== EMPTY_DEPS) {
      for (let i = 0, len = prevDeps.length; i < len; i++) {
        const dep = prevDeps[i];
        if (dep) dep._tempUnsub = prevUnsubs[i];
      }
    }

    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const nextUnsubs = unsubArrayPool.acquire();

    this._nextDeps = nextDeps;
    this._nextVersions = nextVersions;
    this._nextUnsubs = nextUnsubs;
    this._currentEpoch = nextEpoch();

    let committed = false;

    try {
      const result = trackingContext.run(this, this._fn);

      // Commit
      const trackedCount = nextDeps.length;
      nextDeps.length = trackedCount;
      nextVersions.length = trackedCount;

      this._dependencies = nextDeps;
      this._dependencyVersions = nextVersions;
      this._unsubscribes = nextUnsubs;
      committed = true;

      this._checkLoopWarnings();

      const execId = ++this._execId;

      if (isPromise(result)) {
        result
          .then((asyncCleanup) => {
            if (execId !== this._execId || this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
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
      committed = true; // Dependencies are valid even if fn threw
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      // Cleanup effect context / rollbacks
      this._nextDeps = null;
      this._nextVersions = null;
      this._nextUnsubs = null;

      if (committed) {
        // Release previous deps/unsubs
        if (prevDeps !== EMPTY_DEPS) {
          // Cleanup unused unsubs
          for (let i = 0, len = prevDeps.length; i < len; i++) {
            const dep = prevDeps[i];
            const unsub = dep ? dep._tempUnsub : undefined;
            if (unsub) {
              unsub(); // unsubscribe stale dependency
              if (dep) dep._tempUnsub = undefined;
            }
          }
          depArrayPool.release(prevDeps);
        }
        if (prevUnsubs !== EMPTY_UNSUBS) unsubArrayPool.release(prevUnsubs);
        // prevVersions are missing from the release list in original _cleanupEffect ???
        // Wait, original _cleanupEffect was:
        // if (ctx.prevVersions !== EMPTY_VERSIONS) versionArrayPool.release(ctx.prevVersions);
        // My code below uses 'this._dependencyVersions' which is now 'nextVersions'.
        // We need to release the OLD versions array.
        // Wait, 'prevVersions' local variable holds the old array.
        // The 'this._dependencyVersions' has been updated to 'nextVersions'.
        // So I need to release 'prevVersions'. Note: I didn't verify if I need to capture it in a local variable before overwriting strictly, but I did: `const prevVersions = this._dependencyVersions;` at start.
        if (this._dependencyVersions !== prevVersions && prevVersions !== EMPTY_VERSIONS) {
          // Redundant check but safe
          versionArrayPool.release(prevVersions);
        } else if (prevVersions !== EMPTY_VERSIONS && committed) {
          versionArrayPool.release(prevVersions);
        }
      } else {
        // Rollback
        depArrayPool.release(nextDeps);
        versionArrayPool.release(nextVersions);

        // unsubscribe new subscriptions
        for (let i = 0, len = nextUnsubs.length; i < len; i++) {
          nextUnsubs[i]?.();
        }
        unsubArrayPool.release(nextUnsubs);

        // Clear temp unsubs from prev deps to avoid leak or bad state
        if (prevDeps !== EMPTY_DEPS) {
          for (let i = 0, len = prevDeps.length; i < len; i++) {
            const dep = prevDeps[i];
            if (dep) dep._tempUnsub = undefined;
          }
        }
      }

      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
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
        console.error(wrapError(e, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER));
      }
    }
  }

  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
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
 * Creates and starts a reactive effect that automatically tracks dependencies.
 * The effect function is executed immediately and re-scheduled whenever its
 * reactive dependencies change.
 *
 * @param fn - The function to be executed as a reactive effect.
 * @param options - Configuration options to customize effect behavior (e.g., scheduling, error handling).
 * @returns An effect instance providing control over the effect's lifecycle.
 * @throws {EffectError} If the provided `fn` is not a function.
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  effectInstance.execute();

  return effectInstance;
}
