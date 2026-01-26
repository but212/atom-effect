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

class EffectImpl extends ReactiveNode implements EffectObject, DependencyTracker {
  private _cleanup: (() => void) | null = null;
  private _dependencies: Dependency[] = EMPTY_DEPS;
  private _dependencyVersions: number[] = EMPTY_VERSIONS;
  private _unsubscribes: (() => void)[] = EMPTY_UNSUBS;

  private _nextDeps: Dependency[] | null = null;
  private _nextVersions: number[] | null = null;
  private _nextUnsubs: (() => void)[] | null = null;
  private _executeTask: (() => void) | undefined;

  private readonly _onError: ((error: unknown) => void) | null;
  private _currentEpoch = -1;
  private _lastFlushEpoch = -1;
  private _executionsInEpoch = 0;

  private readonly _fn: EffectFunction;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;

  private _history: number[] | null;
  private _executionCount = 0;
  private _historyPtr = 0;
  private readonly _historyCapacity: number;
  private _execId = 0;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();

    // V8 Hidden Class Stability
    this._onError = options.onError ?? null;
    this._fn = fn;

    let flags = EFFECT_STATE_FLAGS.IS_EFFECT | EFFECT_STATE_FLAGS.IS_TRACKER;
    if (options.sync) flags |= EFFECT_STATE_FLAGS.SYNC;
    if (options.trackModifications) flags |= EFFECT_STATE_FLAGS.TRACK_MODIFICATIONS;
    this.flags = flags;

    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    const isFiniteLimit = Number.isFinite(this._maxExecutions);
    const capacity = isFiniteLimit
      ? Math.min(this._maxExecutions + 1, SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND + 1)
      : 0;
    this._historyCapacity = capacity;
    this._history = IS_DEV && isFiniteLimit && capacity > 0 ? new Array(capacity).fill(0) : null;

    debug.attachDebugInfo(this, 'effect', this.id);
  }

  public run(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED)
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    this.execute(true);
  }

  public dispose(): void {
    const flags = this.flags;
    if (flags & EFFECT_STATE_FLAGS.DISPOSED) return;

    this.flags = flags | EFFECT_STATE_FLAGS.DISPOSED;
    this._safeCleanup();

    if (this._unsubscribes !== EMPTY_UNSUBS) {
      const subs = this._unsubscribes;
      for (let i = 0, len = subs.length; i < len; i++) subs[i]?.();
      unsubArrayPool.release(subs);
      this._unsubscribes = EMPTY_UNSUBS;
    }

    if (this._dependencies !== EMPTY_DEPS) {
      depArrayPool.release(this._dependencies);
      this._dependencies = EMPTY_DEPS;
    }

    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }

    this._executeTask = undefined;
  }

  public addDependency(dep: Dependency): void {
    const {
      flags,
      _currentEpoch: epoch,
      _nextDeps: nDeps,
      _nextVersions: nVers,
      _nextUnsubs: nUnsubs,
    } = this;

    if (!(flags & EFFECT_STATE_FLAGS.EXECUTING) || dep._lastSeenEpoch === epoch) return;
    dep._lastSeenEpoch = epoch;

    if (!nDeps || !nVers || !nUnsubs) return;

    nDeps.push(dep);
    nVers.push(dep.version);

    const temp = dep._tempUnsub;
    if (temp) {
      nUnsubs.push(temp);
      dep._tempUnsub = undefined;
    } else {
      this._subscribeTo(dep);
    }
  }

  public execute(force = false): void {
    const flags = this.flags;
    if (
      flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING) ||
      (!force && !this._shouldExecute())
    )
      return;

    this._checkInfiniteLoop();
    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    this._safeCleanup();

    const ctx = this._prepareEffectExecutionContext();
    let committed = false;

    try {
      const result = trackingContext.run(this, this._fn);

      const trackedCount = ctx.nextDeps.length;
      ctx.nextDeps.length = trackedCount;
      ctx.nextVersions.length = trackedCount;

      this._dependencies = ctx.nextDeps;
      this._dependencyVersions = ctx.nextVersions;
      this._unsubscribes = ctx.nextUnsubs;
      committed = true;

      if (flags & EFFECT_STATE_FLAGS.TRACK_MODIFICATIONS) this._checkLoopWarnings();

      const execId = ++this._execId;
      if (isPromise(result)) {
        result
          .then((asyncCleanup) => {
            if (execId !== this._execId || this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
              if (typeof asyncCleanup === 'function') asyncCleanup();
              return;
            }
            if (typeof asyncCleanup === 'function') this._cleanup = asyncCleanup;
          })
          .catch((err) => {
            if (execId === this._execId) this._handleExecutionError(err);
          });
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      committed = true;
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      this._cleanupEffect(ctx, committed);
      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
    }
  }

  private _prepareEffectExecutionContext(): EffectExecutionContext {
    const { _dependencies: pDeps, _unsubscribes: pUnsubs } = this;
    const nDeps = depArrayPool.acquire();
    const nVers = versionArrayPool.acquire();
    const nUnsubs = unsubArrayPool.acquire();
    const epoch = nextEpoch();

    if (pDeps !== EMPTY_DEPS) {
      for (let i = 0, len = pDeps.length; i < len; i++) {
        const dep = pDeps[i];
        if (dep) dep._tempUnsub = pUnsubs[i];
      }
    }

    this._nextDeps = nDeps;
    this._nextVersions = nVers;
    this._nextUnsubs = nUnsubs;
    this._currentEpoch = epoch;

    return {
      prevDeps: pDeps,
      prevVersions: this._dependencyVersions,
      prevUnsubs: pUnsubs,
      nextDeps: nDeps,
      nextVersions: nVers,
      nextUnsubs: nUnsubs,
    };
  }

  private _cleanupEffect(ctx: EffectExecutionContext, committed: boolean): void {
    this._nextDeps = this._nextVersions = this._nextUnsubs = null;

    if (committed) {
      const { prevDeps } = ctx;
      if (prevDeps !== EMPTY_DEPS) {
        for (let i = 0, len = prevDeps.length; i < len; i++) {
          const dep = prevDeps[i];
          if (dep) {
            const unsub = dep._tempUnsub;
            if (unsub) {
              unsub();
              dep._tempUnsub = undefined;
            }
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
      if (nextUnsubs) {
        for (let i = 0, len = nextUnsubs.length; i < len; i++) nextUnsubs[i]?.();
        unsubArrayPool.release(nextUnsubs);
      }

      const { prevDeps } = ctx;
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
      const unsub = dep.subscribe(() => {
        if (
          this.flags & EFFECT_STATE_FLAGS.TRACK_MODIFICATIONS &&
          this.flags & EFFECT_STATE_FLAGS.EXECUTING
        ) {
          dep._modifiedAtEpoch = this._currentEpoch;
        }
        if (this.flags & EFFECT_STATE_FLAGS.SYNC) return this.execute();
        let task = this._executeTask;
        if (!task) {
          task = this._executeTask = () => this.execute();
        }
        scheduler.schedule(task);
      });
      this._nextUnsubs?.push(unsub);
    } catch (error) {
      this._handleExecutionError(error);
      this._nextUnsubs?.push(() => {});
    }
  }

  private _safeCleanup(): void {
    const cleanup = this._cleanup;
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        this._handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
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

    if (++this._executionsInEpoch > this._maxExecutionsPerFlush)
      this._throwInfiniteLoopError('per-effect');
    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH)
      this._throwInfiniteLoopError('global');

    this._executionCount++;
    if (this._history) {
      const now = Date.now();
      const ptr = this._historyPtr;
      this._history[ptr] = now;
      this._historyPtr = (ptr + 1) % this._historyCapacity;
      const oldest = this._history[this._historyPtr] ?? 0;
      if (oldest > 0 && now - oldest < TIME_CONSTANTS.ONE_SECOND_MS) {
        const error = new EffectError(
          `Effect executed ${this._historyCapacity} times within 1 second.`
        );
        this.dispose();
        if (this._onError) this._onError(error);
        if (IS_DEV) throw error;
      }
    }
  }

  private _throwInfiniteLoopError(type: string): never {
    const error = new EffectError(
      `Infinite loop detected (${type}): ${this._executionsInEpoch} iterations. ` +
        'Total executions in flush: ' +
        flushExecutionCount
    );
    this.dispose();
    console.error(error);
    throw error;
  }

  private _shouldExecute(): boolean {
    const { _dependencies: deps, _dependencyVersions: vers } = this;
    const len = deps.length;
    if (len === 0) return true;

    for (let i = 0; i < len; i++) {
      const dep = deps[i];
      if (!dep) continue;
      if (dep.version !== vers[i]) return true;
      if (
        (dep.flags & (NODE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.DIRTY)) ===
        (NODE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.DIRTY)
      ) {
        try {
          untracked(() => (dep as unknown as { value: unknown }).value);
          if (dep.version !== vers[i]) return true;
        } catch {
          return true;
        }
      }
    }
    return false;
  }

  private _handleExecutionError(
    e: unknown,
    msg: string = ERROR_MESSAGES.EFFECT_EXECUTION_FAILED
  ): void {
    const err = wrapError(e, EffectError, msg);
    console.error(err);
    if (this._onError) {
      try {
        this._onError(err);
      } catch (cbErr) {
        console.error(
          wrapError(cbErr, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER)
        );
      }
    }
  }

  private _checkLoopWarnings(): void {
    const { _dependencies: deps, _currentEpoch: epoch } = this;
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

  get isDisposed() {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }
  get executionCount() {
    return this._executionCount;
  }
  get isExecuting() {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }
}

/**
 * Creates and immediately executes a reactive effect.
 * The effect tracks its dependencies during execution and re-runs automatically
 * when any of those dependencies change.
 *
 * @param fn - The function to be executed as an effect.
 * @param options - Configuration options for the effect instance.
 * @returns An object representing the created effect, allowing for manual disposal.
 * @throws {EffectError} If the provided `fn` is not a valid function.
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  const inst = new EffectImpl(fn, options);
  inst.execute();
  return inst;
}
