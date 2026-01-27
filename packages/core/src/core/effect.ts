import { EFFECT_STATE_FLAGS, IS_DEV, SCHEDULER_CONFIG, TIME_CONSTANTS } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { DependencyLink } from '@/core/dep-tracking';
import { EffectError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import {
  flushEpoch,
  flushExecutionCount,
  incrementFlushExecutionCount,
  nextEpoch,
} from '@/internal/epoch';
import { EMPTY_LINKS, linksArrayPool } from '@/internal/pool';
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
  private _cleanup: (() => void) | null = null;
  private _links: DependencyLink[] = EMPTY_LINKS;
  private _nextLinks: DependencyLink[] | null = null;
  private _executeTask: (() => void) | undefined;

  private readonly _onError: ((error: unknown) => void) | null;

  private _currentEpoch = -1;
  private _lastFlushEpoch = -1;
  private _executionsInEpoch = 0;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;
  private readonly _trackModifications: boolean;

  private _history: number[] | null;
  private _executionCount = 0;
  private _historyPtr = 0;
  private readonly _historyCapacity: number;
  private _execId = 0;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();
    this._fn = fn;
    this._onError = options.onError ?? null;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;
    this._trackModifications = options.trackModifications ?? false;

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

  private _execCleanup(): void {
    if (!this._cleanup) return;
    try {
      this._cleanup();
    } catch (error) {
      this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
    this._cleanup = null;
  }

  public dispose(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this._execCleanup();

    const links = this._links;
    if (links !== EMPTY_LINKS) {
      for (let i = 0, len = links.length; i < len; i++) {
        links[i]!.unsub?.();
      }
      linksArrayPool.release(links);
      this._links = EMPTY_LINKS;
    }
    this._executeTask = undefined;
  }

  public addDependency(dep: Dependency): void {
    if (!(this.flags & EFFECT_STATE_FLAGS.EXECUTING)) return;
    if (dep._lastSeenEpoch === this._currentEpoch) return;
    dep._lastSeenEpoch = this._currentEpoch;

    const nextLinks = this._nextLinks!;
    if (dep._tempUnsub) {
      nextLinks.push(new DependencyLink(dep, dep.version, dep._tempUnsub));
      dep._tempUnsub = undefined;
      return;
    }

    try {
      const unsubscribe = dep.subscribe(() => {
        if (this._trackModifications && this.flags & EFFECT_STATE_FLAGS.EXECUTING)
          dep._modifiedAtEpoch = this._currentEpoch;
        if (this._sync) return this.execute();
        if (!this._executeTask) this._executeTask = () => this.execute();
        scheduler.schedule(this._executeTask!);
      });
      nextLinks.push(new DependencyLink(dep, dep.version, unsubscribe));
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
    }
  }

  public execute(force = false): void {
    if (this.flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) return;
    if (!force && this._links.length > 0 && !this._isDirty()) return;

    this._checkInfiniteLoops();

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    this._execCleanup();

    const prevLinks = this._links;
    if (prevLinks !== EMPTY_LINKS) {
      for (let i = 0, len = prevLinks.length; i < len; i++) {
        const link = prevLinks[i];
        if (link) link.node._tempUnsub = link.unsub;
      }
    }

    const nextLinks = linksArrayPool.acquire();
    this._nextLinks = nextLinks;
    this._currentEpoch = nextEpoch();

    let committed = false;
    try {
      const result = trackingContext.run(this, this._fn);
      this._links = nextLinks;
      committed = true;

      this._checkLoopWarnings();
      const execId = ++this._execId;

      if (isPromise(result)) {
        result.then(
          (cleanup) => {
            if (execId !== this._execId || this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
              if (typeof cleanup === 'function') {
                try {
                  cleanup();
                } catch (e) {
                  this._handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
                }
              }
              return;
            }
            if (typeof cleanup === 'function') this._cleanup = cleanup;
          },
          (err) => execId === this._execId && this._handleExecutionError(err)
        );
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      committed = true;
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      this._nextLinks = null;
      if (committed) {
        if (prevLinks !== EMPTY_LINKS) {
          for (let i = 0, len = prevLinks.length; i < len; i++) {
            const link = prevLinks[i];
            const unsub = link?.node._tempUnsub;
            if (unsub) {
              unsub();
              if (link) link.node._tempUnsub = undefined;
            }
          }
          linksArrayPool.release(prevLinks);
        }
      } else {
        for (let i = 0, len = nextLinks.length; i < len; i++) nextLinks[i]?.unsub?.();
        linksArrayPool.release(nextLinks);
        if (prevLinks !== EMPTY_LINKS) {
          for (let i = 0, len = prevLinks.length; i < len; i++) {
            const link = prevLinks[i];
            if (link) link.node._tempUnsub = undefined;
          }
        }
      }
      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
    }
  }

  private _isDirty(): boolean {
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const link = links[i]!;
      const dep = link.node;
      if (dep.version !== link.version) return true;
      if ('value' in (dep as object)) {
        try {
          untracked(() => (dep as { value: unknown }).value);
        } catch {
          return true;
        }
        if (dep.version !== link.version) return true;
      }
    }
    return false;
  }

  private _checkInfiniteLoops(): void {
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
      this._history[this._historyPtr] = now;
      this._historyPtr = (this._historyPtr + 1) % this._historyCapacity;
      const oldest = this._history[this._historyPtr] || 0;

      if (oldest > 0 && now - oldest < TIME_CONSTANTS.ONE_SECOND_MS) {
        const err = new EffectError(
          `Effect executed too frequently within 1 second. Suspected infinite loop.`
        );
        this.dispose();
        this._handleExecutionError(err);
        if (IS_DEV) throw err;
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

  private _throwInfiniteLoopError(type: 'per-effect' | 'global'): never {
    const error = new EffectError(
      `Infinite loop detected (${type}): effect executed ${this._executionsInEpoch} times in current flush. Total executions in flush: ${flushExecutionCount}`
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
    if (this._onError) {
      try {
        this._onError(errorObj);
      } catch (e) {
        console.error(wrapError(e, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER));
      }
    }
  }

  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
      const epoch = this._currentEpoch;
      const links = this._links;
      for (let i = 0, len = links.length; i < len; i++) {
        const dep = links[i]!.node;
        if (dep._modifiedAtEpoch === epoch) {
          debug.warn(
            true,
            `Effect is reading a dependency (${debug.getDebugName(dep) || 'unknown'}) that it just modified. Infinite loop may occur`
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
