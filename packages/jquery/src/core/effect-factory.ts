/**
 * @module AEJEffectFactory
 *
 * Responsibility:
 * Orchestrates the creation and registration of reactive effects that
 * bind state to DOM elements. Manages asynchronous race conditions
 * and ensures deterministic resource cleanup via the registry.
 */

import { effect, isAtom, isPromise, untracked } from '@but212/atom-effect';
import { SYSTEM_BINDING } from '@/constants';
import { registry } from '@/core/registry';
import type { AsyncReactiveValue } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Enumeration of binding types for debugging and performance tracking.
 * @internal
 */
export type BindingDebugType =
  | 'text'
  | 'html'
  | 'show'
  | 'hide'
  | 'checked'
  | `class.${string & {}}`
  | `css.${string & {}}`
  | `attr.${string & {}}`
  | `prop.${string & {}}`
  | (string & {});

export interface BatchedTask {
  isReactive: boolean;
  run: (element: Element) => () => void;
}

let activeBatchCollector: BatchedTask[] | null = null;

export function withBatchCollection(callback: () => void): BatchedTask[] {
  const previous = activeBatchCollector;
  const current: BatchedTask[] = [];
  activeBatchCollector = current;
  try {
    callback();
  } finally {
    activeBatchCollector = previous;
  }
  return current;
}

/**
 * Resolves the current value of a source (atom, function, or static value).
 * @internal
 */
const getSourceValue = <T>(source: AsyncReactiveValue<T>): T | Promise<T> => {
  if (isAtom(source)) return source.value;
  if (typeof source === 'function') return (source as () => T | Promise<T>)();
  return source;
};

/**
 * Logic: Monotonic Async Race Protection
 *
 * Strategy:
 * Assigns an incrementing ID to each update. If a promise resolves after a
 * newer update has started, the stale result is discarded to prevent UI flicker.
 *
 * @internal
 */
function createAsyncRunner<T>(
  element: Element,
  debugType: BindingDebugType,
  updater: (value: T) => void
) {
  let activeVersion = 0;
  let isDisposed = false;
  let isCleanupRegistered = false;

  const runUpdate = (targetValue: T, isAsync: boolean) => {
    if (isDisposed) return;
    untracked(() => {
      try {
        updater(targetValue);
        debug.domUpdated(
          SYSTEM_BINDING.PREFIX,
          element,
          isAsync ? `${debugType} (async)` : debugType,
          targetValue
        );
      } catch (error) {
        debug.error(
          SYSTEM_BINDING.PREFIX,
          SYSTEM_BINDING.ERRORS.UPDATER_ERROR(debugType, !isAsync),
          error
        );
      }
    });
  };

  return (value: T | Promise<T>) => {
    const version = ++activeVersion;

    if (!isPromise(value)) {
      runUpdate(value, false);
      return;
    }

    if (!isCleanupRegistered) {
      registry.onCleanup(element, () => {
        isDisposed = true;
      });
      isCleanupRegistered = true;
    }

    value.then(
      (resolved) => {
        if (version === activeVersion) {
          runUpdate(resolved, true);
        }
      },
      (error) => {
        if (version === activeVersion && !isDisposed) {
          debug.error(
            SYSTEM_BINDING.PREFIX,
            SYSTEM_BINDING.ERRORS.UPDATER_ERROR(debugType, false),
            error
          );
        }
      }
    );
  };
}

const isReactiveSource = (source: unknown): boolean =>
  isAtom(source) || typeof source === 'function';

/** Runs `fn` inside a registry-tracked effect when any input is reactive, otherwise once. */
function trackOrRun(element: Element, hasReactive: boolean, fn: () => void, name: string): void {
  if (hasReactive) {
    registry.trackEffect(element, effect(fn, { name }));
  } else {
    fn();
  }
}

/**
 * Logic: Effect Registration
 * Defers to the active batch collector when one exists; otherwise runs `read` inside a registry-tracked
 * effect for reactive inputs, or applies it once for static inputs.
 *
 * @internal
 */
function registerEffect<T>(
  element: Element,
  hasReactive: boolean,
  debugType: BindingDebugType,
  updater: (value: T) => void,
  read: () => T | Promise<T>
): void {
  if (activeBatchCollector) {
    activeBatchCollector.push({
      isReactive: hasReactive,
      run: (element) => {
        const runner = createAsyncRunner(element, debugType, updater);
        return () => runner(read());
      },
    });
    return;
  }

  const runner = createAsyncRunner(element, debugType, updater);

  trackOrRun(element, hasReactive, () => runner(read()), debugType);
}

/**
 * Logic: Reactive Value Binding
 * Establishes a reactive effect between a single source and a DOM element.
 *
 * Lifecycle: Resource Linking
 * The created effect is automatically registered with the global `registry`
 * and bound to the element's lifecycle for synchronous disposal.
 *
 * @internal
 */
export function registerReactiveEffect<T>(
  element: Element,
  source: AsyncReactiveValue<T>,
  updater: (value: T) => void,
  debugType: BindingDebugType
): void {
  const hasReactive = isReactiveSource(source);

  registerEffect(element, hasReactive, debugType, updater, () => getSourceValue(source));
}

/**
 * Optimization: Multi-Source Reactive Binding
 * Establishes a reactive effect between a map of sources and a DOM element.
 *
 * Optimization: Single-pass Collection
 * Replaces multiple array methods (map/filter/forEach) with a single for-loop
 * to reduce memory allocation and GC pressure during state changes.
 *
 * @internal
 */
export function registerMapEffect<T>(
  element: Element,
  sourceMap: Record<string, AsyncReactiveValue<T>>,
  updater: (map: Record<string, T>) => void,
  debugType: BindingDebugType
): void {
  const keys = Object.keys(sourceMap);

  const hasReactive = keys.some((key) => isReactiveSource(sourceMap[key]));

  const collect = () => {
    const resolvedMap: Record<string, T> = {};
    const promises: Promise<{ key: string; value: T }>[] = [];

    for (const key of keys) {
      const value = getSourceValue(sourceMap[key]);

      if (isPromise(value)) {
        promises.push(
          (value as Promise<T>).then((resolvedValue) => ({ key, value: resolvedValue }))
        );
      } else {
        resolvedMap[key] = value as T;
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then((results) => {
        for (const result of results) {
          resolvedMap[result.key] = result.value;
        }
        return resolvedMap;
      });
    }
    return resolvedMap;
  };

  registerEffect(element, hasReactive, debugType, updater, collect);
}

export function registerBatchedEffects(element: Element, tasks: BatchedTask[]): void {
  const hasReactive = tasks.some((task) => task.isReactive);

  const runners = tasks.map((task) => task.run(element));

  // Constraint: Binding Isolation
  // A source that throws while being read must not stop its siblings, matching
  // the behavior of chained bindings that each own a separate effect.
  const runAll = () => {
    for (let i = 0; i < runners.length; i++) {
      try {
        runners[i]?.();
      } catch (error) {
        debug.error(SYSTEM_BINDING.PREFIX, SYSTEM_BINDING.ERRORS.UPDATER_ERROR('batch'), error);
      }
    }
  };

  trackOrRun(element, hasReactive, runAll, 'batch');
}
