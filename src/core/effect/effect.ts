import { EFFECT_STATE_FLAGS, IS_DEV, SCHEDULER_CONFIG } from '@/constants';
import { ReactiveNode } from '@/core/base/reactive-node';
import { EffectError, isPromise, wrapError } from '@/errors/errors';
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

/** Internal effect implementation with dependency tracking and infinite loop detection */
class EffectImpl extends ReactiveNode implements EffectObject, DependencyTracker {
  private _currentEpoch: number;
  private _lastFlushEpoch: number;
  private _executionsInEpoch: number;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;
  private readonly _trackModifications: boolean;

  private _cleanup: (() => void) | null;
  private _dependencies: Dependency[];
  private _dependencyVersions: number[];
  private _unsubscribes: (() => void)[];
  private _nextDeps: Dependency[] | null;
  private _nextVersions: number[] | null;
  private _nextUnsubs: (() => void)[] | null;
  private _history: number[] | null;
  private _executionCount: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();

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

    this._cleanup = null;
    this._dependencies = EMPTY_DEPS as Dependency[];
    this._dependencyVersions = EMPTY_VERSIONS as number[];
    this._unsubscribes = EMPTY_UNSUBS as (() => void)[];
    this._nextDeps = null;
    this._nextVersions = null;
    this._nextUnsubs = null;
    this._history = IS_DEV ? [] : null;
    this._executionCount = 0;

    debug.attachDebugInfo(this, 'effect', this.id);
  }

  /** Manually triggers effect execution */
  public run = (): void => {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS as number[];
    }
    this.execute();
  };

  /** Disposes effect and cleans up all resources */
  public dispose = (): void => {
    if (this.isDisposed) return;

    this._setDisposed();
    this._safeCleanup();

    if (this._unsubscribes !== EMPTY_UNSUBS) {
      for (let i = 0; i < this._unsubscribes.length; i++) {
        const unsub = this._unsubscribes[i];
        if (unsub) unsub();
      }
      unsubArrayPool.release(this._unsubscribes);
      this._unsubscribes = EMPTY_UNSUBS as (() => void)[];
    }

    if (this._dependencies !== EMPTY_DEPS) {
      depArrayPool.release(this._dependencies);
      this._dependencies = EMPTY_DEPS as Dependency[];
    }

    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS as number[];
    }
  };

  /** Adds dependency to tracking list (called by tracking context) */
  public addDependency = (dep: Dependency): void => {
    if (this.isExecuting && this._nextDeps && this._nextUnsubs && this._nextVersions) {
      const epoch = this._currentEpoch;

      if (dep._lastSeenEpoch === epoch) return;
      dep._lastSeenEpoch = epoch;

      this._nextDeps.push(dep);
      this._nextVersions.push(dep.version);

      if (dep._tempUnsub) {
        this._nextUnsubs.push(dep._tempUnsub);
        dep._tempUnsub = undefined;
      } else {
        this._subscribeTo(dep);
      }
    }
  };

  /** Executes effect with dependency tracking */
  public execute = (): void => {
    if (this.isDisposed || this.isExecuting) return;
    if (!this._shouldExecute()) return;

    this._checkInfiniteLoop();
    this._setExecuting(true);
    this._safeCleanup();

    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const prevUnsubs = this._unsubscribes;
    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const nextUnsubs = unsubArrayPool.acquire();
    const epoch = nextEpoch();

    if (prevDeps !== EMPTY_DEPS && prevUnsubs !== EMPTY_UNSUBS) {
      for (let i = 0; i < prevDeps.length; i++) {
        const dep = prevDeps[i];
        if (dep) dep._tempUnsub = prevUnsubs[i];
      }
    }

    this._nextDeps = nextDeps;
    this._nextVersions = nextVersions;
    this._nextUnsubs = nextUnsubs;
    this._currentEpoch = epoch;

    let committed = false;

    try {
      const result = trackingContext.run(this, this._fn);

      this._dependencies = nextDeps;
      this._dependencyVersions = nextVersions;
      this._unsubscribes = nextUnsubs;
      committed = true;

      this._checkLoopWarnings();

      if (isPromise(result)) {
        result
          .then((asyncCleanup) => {
            if (!this.isDisposed && typeof asyncCleanup === 'function') {
              this._cleanup = asyncCleanup;
            }
          })
          .catch((error) => {
            console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
          });
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      committed = true;
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      this._cleanup = null;
    } finally {
      this._setExecuting(false);
      this._nextDeps = null;
      this._nextVersions = null;
      this._nextUnsubs = null;

      if (committed) {
        if (prevDeps !== EMPTY_DEPS) {
          for (let i = 0; i < prevDeps.length; i++) {
            const dep = prevDeps[i];
            if (dep?._tempUnsub) {
              dep._tempUnsub();
              dep._tempUnsub = undefined;
            }
          }
          depArrayPool.release(prevDeps);
        }
        if (prevUnsubs !== EMPTY_UNSUBS) {
          unsubArrayPool.release(prevUnsubs);
        }
        if (prevVersions !== EMPTY_VERSIONS) {
          versionArrayPool.release(prevVersions);
        }
      } else {
        depArrayPool.release(nextDeps);
        versionArrayPool.release(nextVersions);
        for (let i = 0; i < nextUnsubs.length; i++) {
          nextUnsubs[i]?.();
        }
        unsubArrayPool.release(nextUnsubs);

        if (prevDeps !== EMPTY_DEPS) {
          for (let i = 0; i < prevDeps.length; i++) {
            const dep = prevDeps[i];
            if (dep) dep._tempUnsub = undefined;
          }
        }
      }
    }
  };

  private _subscribeTo(dep: Dependency): void {
    try {
      const unsubscribe = dep.subscribe(() => {
        if (this._trackModifications && this.isExecuting) {
          dep._modifiedAtEpoch = this._currentEpoch;
        }

        if (this._sync) {
          this.execute();
        } else {
          scheduler.schedule(this.execute);
        }
      });
      if (this._nextUnsubs) {
        this._nextUnsubs.push(unsubscribe);
      }
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      if (this._nextUnsubs) this._nextUnsubs.push(() => {});
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

  private _setDisposed(): void {
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;
  }

  private _setExecuting(value: boolean): void {
    const mask = EFFECT_STATE_FLAGS.EXECUTING;
    this.flags = (this.flags & ~mask) | (-Number(value) & mask);
  }

  private _safeCleanup(): void {
    if (this._cleanup) {
      try {
        this._cleanup();
      } catch (error) {
        console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED));
      }
      this._cleanup = null;
    }
  }

  private _checkInfiniteLoop(): void {
    if (this._lastFlushEpoch !== flushEpoch) {
      this._lastFlushEpoch = flushEpoch;
      this._executionsInEpoch = 0;
    }

    this._executionsInEpoch++;

    if (this._executionsInEpoch > this._maxExecutionsPerFlush) {
      this._throwInfiniteLoopError('per-effect');
    }

    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._throwInfiniteLoopError('global');
    }

    this._executionCount++;

    if (this._history) {
      const now = Date.now();
      this._history.push(now);

      if (this._history.length > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND + 10) {
        this._history.shift();
      }

      this._checkTimestampLoop(now);
    }
  }

  private _checkTimestampLoop(now: number): void {
    const history = this._history;
    if (!history || this._maxExecutions <= 0) return;

    const oneSecondAgo = now - 1000;
    let count = 0;

    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]! < oneSecondAgo) break;
      count++;
    }

    if (count > this._maxExecutions) {
      const error = new EffectError(
        `Effect executed ${count} times within 1 second. Infinite loop suspected`
      );
      this.dispose();
      console.error(error);
      if (IS_DEV) {
        throw error;
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
    // Early exit: no deps or no version cache means first run or invalidated
    if (this._dependencies === EMPTY_DEPS || this._dependencyVersions === EMPTY_VERSIONS) return true;

    for (let i = 0; i < this._dependencies.length; i++) {
      const dep = this._dependencies[i];
      if (!dep) continue;

      if ('value' in dep) {
        try {
          untracked(() => (dep as { value: unknown }).value);
        } catch {
          return true;
        }
      }

      if (dep.version !== this._dependencyVersions[i]) {
        return true;
      }
    }

    return false;
  }

  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
      const dependencies = this._dependencies;
      for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i];
        if (dep && dep._modifiedAtEpoch === this._currentEpoch) {
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
 * Creates a reactive effect that re-executes when dependencies change.
 * @param fn - Effect function (may return cleanup function or Promise)
 * @param options - { sync?: boolean, maxExecutionsPerSecond?: number, trackModifications?: boolean }
 * @throws {EffectError} If fn is not a function
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  effectInstance.execute();

  return effectInstance;
}
