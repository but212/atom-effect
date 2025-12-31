/**
 * @fileoverview effect: Side effect management
 */

import { EFFECT_STATE_FLAGS, SCHEDULER_CONFIG } from '../../constants';
import { EffectError, isPromise, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { scheduler } from '../../scheduler';
import { type DependencyTracker, trackingContext } from '../../tracking';
import { DependencyManager } from '../../tracking/dependency-manager';
import type {
  Dependency,
  EffectFunction,
  EffectObject,
  EffectOptions,
  ReadonlyAtom,
} from '../../types';
import { debug, generateId } from '../../utils/debug';
import { isAtom } from '../../utils/type-guards';

class EffectImpl implements EffectObject, DependencyTracker {
  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _trackModifications: boolean;
  private readonly _id: number;

  private _flags: number;
  private _cleanup: (() => void) | null;

  private readonly _depManager: DependencyManager;
  private readonly _modifiedDeps: Set<unknown>;
  private readonly _originalDescriptors: WeakMap<Dependency, PropertyDescriptor>;
  private readonly _trackedDeps: Set<Dependency>;

  private readonly _history: Float64Array;
  private _historyIdx: number;
  private _historyCount: number;
  private _executionCount: number;
  private readonly _historyCapacity: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    this._fn = fn;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._trackModifications = options.trackModifications ?? false;
    this._id = generateId();

    this._flags = 0;
    this._cleanup = null;

    this._depManager = new DependencyManager();
    this._modifiedDeps = new Set();
    this._originalDescriptors = new WeakMap();
    this._trackedDeps = new Set();

    this._historyCapacity = this._maxExecutions + 5;
    this._history = new Float64Array(this._historyCapacity);
    this._historyIdx = 0;
    this._historyCount = 0;
    this._executionCount = 0;

    debug.attachDebugInfo(this, 'effect', this._id);
  }

  public run = (): void => {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    this.execute();
  };

  public dispose = (): void => {
    if (this.isDisposed) return;

    this._setDisposed();
    this._safeCleanup();
    this._depManager.unsubscribeAll();

    if (this._trackedDeps.size > 0) {
      this._trackedDeps.forEach((dep) => {
        const descriptor = this._originalDescriptors.get(dep);
        if (descriptor) {
          try {
            Object.defineProperty(dep, 'value', descriptor);
          } catch (_error) {
            debug.warn(true, 'Failed to restore original descriptor');
          }
        }
      });
      this._trackedDeps.clear();
    }
  };

  public addDependency = (dep: unknown): void => {
    try {
      const unsubscribe = (dep as Dependency).subscribe(() => {
        if (this._sync) {
          this.execute();
        } else {
          scheduler.schedule(this.execute);
        }
      });
      this._depManager.addDependency(dep as Dependency, unsubscribe);

      if (this._trackModifications && isAtom(dep)) {
        this._trackModificationsForDep(dep);
      }
    } catch (error) {
      throw wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
    }
  };

  public execute = (): void => {
    if (this.isDisposed || this.isExecuting) return;

    const now = Date.now();
    this._recordExecution(now);

    this._setExecuting(true);
    this._safeCleanup();
    this._depManager.unsubscribeAll();
    this._modifiedDeps.clear();

    try {
      const result = trackingContext.run(this, this._fn);

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
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      this._cleanup = null;
    } finally {
      this._setExecuting(false);
    }
  };

  get isDisposed(): boolean {
    return (this._flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  get executionCount(): number {
    return this._executionCount;
  }

  get isExecuting(): boolean {
    return (this._flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  private _setDisposed(): void {
    this._flags |= EFFECT_STATE_FLAGS.DISPOSED;
  }

  private _setExecuting(value: boolean): void {
    if (value) this._flags |= EFFECT_STATE_FLAGS.EXECUTING;
    else this._flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  }

  private _safeCleanup(): void {
    if (this._cleanup && typeof this._cleanup === 'function') {
      try {
        this._cleanup();
      } catch (error) {
        console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED));
      }
      this._cleanup = null;
    }
  }

  private _recordExecution(now: number): void {
    if (this._maxExecutions <= 0) return;

    const oneSecondAgo = now - 1000;

    this._history[this._historyIdx] = now;
    this._historyIdx = (this._historyIdx + 1) % this._historyCapacity;
    if (this._historyCount < this._historyCapacity) {
      this._historyCount++;
    }
    this._executionCount++;

    let count = 0;
    let idx = (this._historyIdx - 1 + this._historyCapacity) % this._historyCapacity;

    for (let i = 0; i < this._historyCount; i++) {
      if (this._history[idx]! < oneSecondAgo) {
        break;
      }
      count++;
      idx = (idx - 1 + this._historyCapacity) % this._historyCapacity;
    }

    if (count > this._maxExecutions) {
      const message = `Effect executed ${count} times within 1 second. Infinite loop suspected`;
      const error = new EffectError(message);

      this.dispose();
      console.error(error);

      if (debug.enabled) {
        throw error;
      }
    }
  }

  private _trackModificationsForDep(dep: any): void {
    const proto = Object.getPrototypeOf(dep);
    const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (originalDescriptor?.set && !this._originalDescriptors.has(dep)) {
      this._originalDescriptors.set(dep, originalDescriptor);
      this._trackedDeps.add(dep);

      const self = this;

      Object.defineProperty(dep, 'value', {
        set(newValue: unknown) {
          self._modifiedDeps.add(dep);
          originalDescriptor.set?.call(dep, newValue);
        },
        get() {
          return dep.peek();
        },
        configurable: true,
        enumerable: true,
      });
    }
  }

  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
      const dependencies = this._depManager.getDependencies();
      for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i]!;
        if (this._modifiedDeps.has(dep)) {
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

export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);

  effectInstance.execute();

  return effectInstance;
}
