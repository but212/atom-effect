import { COMPUTED_STATE_FLAGS, EFFECT_STATE_FLAGS, IS_DEV, SCHEDULER_CONFIG } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { DependencyLink } from '@/core/dep-tracking';
import { EffectError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import {
  currentFlushEpoch,
  flushExecutionCount,
  incrementFlushExecutionCount,
  nextEpoch,
} from '@/internal/epoch';
import { EMPTY_LINKS, linksArrayPool } from '@/internal/pool';
import { scheduler } from '@/internal/scheduler';
import { type DependencyTracker, trackingContext } from '@/tracking';
import type { Dependency, EffectFunction, EffectObject, EffectOptions } from '@/types';
import { debug } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

/**
 * Effect implementation.
 */
class EffectImpl extends ReactiveNode implements EffectObject, DependencyTracker {
  private _cleanup: (() => void) | null = null;
  private _links: DependencyLink[] = EMPTY_LINKS;
  private _nextLinks: DependencyLink[] | null = null;
  private _executeTask: (() => void) | undefined;
  private _prevLinks: DependencyLink[] | null = null;

  private readonly _onError: ((error: unknown) => void) | null;

  // Cycle detection
  private _currentEpoch = -1;
  private _lastFlushEpoch = -1;
  private _executionsInEpoch = 0;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;
  private readonly _trackModifications: boolean;

  // Frequency tracking (Dev)
  private _executionCount = 0;
  private _windowStart = 0;
  private _windowCount = 0;
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

    this._execCleanup();
    this._releaseLinks(this._links);

    // Reset State
    this._links = EMPTY_LINKS;
    this._executeTask = undefined;
  }

  public addDependency(dep: Dependency): void {
    // Only track if currently executing (double check)
    if (!(this.flags & EFFECT_STATE_FLAGS.EXECUTING)) return;

    // Deduplicate in current epoch
    if (dep._lastSeenEpoch === this._currentEpoch) return;
    dep._lastSeenEpoch = this._currentEpoch;

    const nextLinks = this._nextLinks!;

    // Reclaim existing subscription from previous links (avoids unsubscribe + resubscribe)
    const prev = this._prevLinks;
    if (prev) {
      for (let j = 0, plen = prev.length; j < plen; j++) {
        const plink = prev[j];
        if (plink && plink.node === dep && plink.unsub) {
          nextLinks.push(new DependencyLink(dep, dep.version, plink.unsub));
          plink.unsub = undefined; // Mark as reclaimed
          return;
        }
      }
    }

    try {
      const unsubscribe = dep.subscribe(() => {
        if (this._trackModifications && this.flags & EFFECT_STATE_FLAGS.EXECUTING)
          dep._modifiedAtEpoch = this._currentEpoch;

        if (this._sync) return this.execute();

        // Task creation
        if (!this._executeTask) this._executeTask = () => this.execute();
        scheduler.schedule(this._executeTask!);
      });
      nextLinks.push(new DependencyLink(dep, dep.version, unsubscribe));
    } catch (error) {
      const wrapped = wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
      console.error(wrapped);
      if (this._onError) {
        try {
          this._onError(wrapped);
        } catch {}
      }
      // Add noop link so next execution can attempt re-subscription
      nextLinks.push(new DependencyLink(dep, dep.version, undefined));
    }
  }

  /**
   * Executes effect with tracking.
   */
  public execute(force = false): void {
    if (this.flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) return;

    // Skip if not dirty
    if (!force && this._links.length > 0 && !this._isDirty()) return;

    this._checkInfiniteLoops();

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    this._execCleanup();

    const prevLinks = this._links;
    // Store prev links for subscription reclamation in addDependency
    this._prevLinks = prevLinks !== EMPTY_LINKS ? prevLinks : null;

    // Setup tracking
    const nextLinks = linksArrayPool.acquire();
    this._nextLinks = nextLinks;
    this._currentEpoch = nextEpoch();

    let committed = false;
    try {
      const result = trackingContext.run(this, this._fn);
      this._links = nextLinks;
      committed = true;

      // Inline _checkLoopWarnings
      if (this._trackModifications && debug.enabled) {
        const epoch = this._currentEpoch;
        for (let i = 0, len = nextLinks.length; i < len; i++) {
          const dep = nextLinks[i]!.node;
          if (dep._modifiedAtEpoch === epoch) {
            debug.warn(
              true,
              `Effect is reading a dependency (${debug.getDebugName(dep) || 'unknown'}) that it just modified. Infinite loop may occur`
            );
          }
        }
      }

      // Handle result
      if (isPromise(result)) {
        this._handleAsyncResult(result);
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      // Commit on error
      committed = true;
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      this._finalizeDependencies(committed, prevLinks, nextLinks);
      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
    }
  }

  private _handleAsyncResult(promise: Promise<unknown>): void {
    const execId = ++this._execId;
    promise.then(
      (cleanup) => {
        // Guard against race conditions (new execution or disposal happened)
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
        if (typeof cleanup === 'function') this._cleanup = cleanup as () => void;
      },
      (err) => execId === this._execId && this._handleExecutionError(err)
    );
  }

  private _finalizeDependencies(
    committed: boolean,
    prevLinks: DependencyLink[],
    nextLinks: DependencyLink[]
  ): void {
    this._nextLinks = null;

    if (committed) {
      // Cleanup unclaimed prev subscriptions
      const prev = this._prevLinks;
      if (prev) {
        for (let i = 0, len = prev.length; i < len; i++) {
          prev[i]?.unsub?.();
        }
      }
      if (prevLinks !== EMPTY_LINKS) {
        linksArrayPool.release(prevLinks);
      }
    } else {
      // Abort and restore
      this._releaseLinks(nextLinks);
      linksArrayPool.release(nextLinks);
    }

    this._prevLinks = null;
  }

  private _releaseLinks(links: DependencyLink[]): void {
    if (links === EMPTY_LINKS) return;
    for (let i = 0, len = links.length; i < len; i++) {
      links[i]?.unsub?.();
    }
    linksArrayPool.release(links);
  }

  private _isDirty(): boolean {
    const links = this._links;
    // Save tracking context once, restore at end (avoids per-iteration function allocation)
    const prevContext = trackingContext.current;
    trackingContext.current = null;

    try {
      for (let i = 0, len = links.length; i < len; i++) {
        const link = links[i]!;
        const dep = link.node;

        // Trigger recomputation for computed dependencies
        if (dep.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) {
          try {
            // Access value directly since we've disabled tracking
            void (dep as { value: unknown }).value;
          } catch {
            if (IS_DEV) {
              console.warn(`[atom-effect] Dependency #${dep.id} threw during dirty check`);
            }
            return true; // Error usually implies dirty/re-eval needed
          }
        }

        // Version Check
        if (dep.version !== link.version) return true;
      }
      return false;
    } finally {
      trackingContext.current = prevContext;
    }
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

  private _checkInfiniteLoops(): void {
    const epoch = currentFlushEpoch();
    if (this._lastFlushEpoch !== epoch) {
      this._lastFlushEpoch = epoch;
      this._executionsInEpoch = 0;
    }

    if (++this._executionsInEpoch > this._maxExecutionsPerFlush)
      this._throwInfiniteLoopError('per-effect');
    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH)
      this._throwInfiniteLoopError('global');

    this._executionCount++;

    // Frequency check (dev only)
    if (IS_DEV && Number.isFinite(this._maxExecutions)) {
      const now = Date.now();
      if (now - this._windowStart >= 1000) {
        this._windowStart = now;
        this._windowCount = 1;
      } else if (++this._windowCount > this._maxExecutions) {
        const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
        this.dispose();
        this._handleExecutionError(err);
        throw err;
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
}

/**
 * Creates and starts an effect.
 *
 * @param fn - Effect function.
 * @param options - Configuration options.
 * @returns Effect instance.
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  effectInstance.execute();

  return effectInstance;
}
