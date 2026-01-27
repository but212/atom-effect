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
  private _cleanup: (() => void) | null;
  private _links: DependencyLink[];
  private _nextLinks: DependencyLink[] | null;
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

    this._cleanup = null;
    this._links = EMPTY_LINKS;
    this._nextLinks = null;
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
    const flags = this.flags;
    if (flags & EFFECT_STATE_FLAGS.DISPOSED) return;

    this.flags = flags | EFFECT_STATE_FLAGS.DISPOSED;

    if (this._cleanup) {
      try {
        this._cleanup();
      } catch (error) {
        this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
      }
      this._cleanup = null;
    }

    const links = this._links;
    if (links !== EMPTY_LINKS) {
      for (let i = 0, len = links.length; i < len; i++) {
        const link = links[i];
        if (link?.unsub) link.unsub();
      }
      linksArrayPool.release(links);
      this._links = EMPTY_LINKS;
    }

    this._executeTask = undefined;
  }

  public addDependency(dep: Dependency): void {
    const flags = this.flags;
    if (!(flags & EFFECT_STATE_FLAGS.EXECUTING)) return;

    const epoch = this._currentEpoch;
    if (dep._lastSeenEpoch === epoch) return;
    dep._lastSeenEpoch = epoch;

    const nextLinks = this._nextLinks!;

    const tempUnsub = dep._tempUnsub;
    if (tempUnsub) {
      nextLinks.push(new DependencyLink(dep, dep.version, tempUnsub));
      dep._tempUnsub = undefined;
      return;
    }

    try {
      const isSync = this._sync;
      const trackMod = this._trackModifications;

      const unsubscribe = dep.subscribe(() => {
        if (trackMod && this.flags & EFFECT_STATE_FLAGS.EXECUTING) {
          dep._modifiedAtEpoch = this._currentEpoch;
        }

        if (isSync) {
          this.execute();
          return;
        }

        if (!this._executeTask) {
          this._executeTask = () => this.execute();
        }
        const task = this._executeTask;
        scheduler.schedule(task);
      });
      nextLinks.push(new DependencyLink(dep, dep.version, unsubscribe));
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
    }
  }

  public execute(force = false): void {
    const flags = this.flags;
    if (flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) return;

    // 1. Dependency Dirty Check (Fast Path)
    if (!force) {
      const links = this._links;
      const dLen = links.length;
      if (dLen > 0) {
        let isDirty = false;
        for (let i = 0; i < dLen; i++) {
          const link = links[i]!;
          const dep = link.node;
          if (dep.version !== link.version) {
            isDirty = true;
            break;
          }
          if ('value' in (dep as unknown as Record<string, unknown>)) {
            try {
              untracked(() => (dep as unknown as { value: unknown }).value);
              if (dep.version !== link.version) {
                isDirty = true;
                break;
              }
            } catch {
              isDirty = true;
              break;
            }
          }
        }
        if (!isDirty) return;
      }
    }

    // 2. Infinite Loop & Rate Limit Detection
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

    const history = this._history;
    if (history) {
      const now = Date.now();
      const ptr = this._historyPtr;
      history[ptr] = now;
      const nextPtr = (ptr + 1) % this._historyCapacity;
      this._historyPtr = nextPtr;

      const oldestTime = history[nextPtr] || 0;
      if (oldestTime > 0 && now - oldestTime < TIME_CONSTANTS.ONE_SECOND_MS) {
        const error = new EffectError(
          `Effect executed too frequently within 1 second. Suspected infinite loop.`
        );
        this.dispose();
        this._handleExecutionError(error);
        if (IS_DEV) throw error;
        return;
      }
    }

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;

    // 3. Preparation
    if (this._cleanup) {
      try {
        this._cleanup();
      } catch (error) {
        this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
      }
      this._cleanup = null;
    }

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

      // Commit
      this._links = nextLinks;
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
      this._nextLinks = null;

      if (committed) {
        if (prevLinks !== EMPTY_LINKS) {
          for (let i = 0, len = prevLinks.length; i < len; i++) {
            const link = prevLinks[i];
            const unsub = link ? link.node._tempUnsub : undefined;
            if (unsub) {
              unsub();
              if (link) link.node._tempUnsub = undefined;
            }
          }
          linksArrayPool.release(prevLinks);
        }
      } else {
        // Rollback
        for (let i = 0, len = nextLinks.length; i < len; i++) {
          const link = nextLinks[i];
          if (link?.unsub) link.unsub();
        }
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
      const links = this._links;
      const epoch = this._currentEpoch;
      for (let i = 0, len = links.length; i < len; i++) {
        const link = links[i]!;
        const dep = link.node;
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
