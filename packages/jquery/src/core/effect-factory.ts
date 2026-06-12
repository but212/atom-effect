/**
 * @module AEJEffectFactory
 *
 * Responsibility:
 * Orchestrates the creation and registration of reactive effects that
 * bind state to DOM elements. Manages asynchronous race conditions
 * and ensures deterministic resource cleanup via the registry.
 */

import { effect, isAtom, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { SYSTEM_BINDING } from '@/constants';
import { registry } from '@/core/registry';
import type { AsyncReactiveValue } from '@/types';
import { isPromise } from '@/utils';
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
  source?: AsyncReactiveValue<unknown>;
  sourceMap?: Record<string, AsyncReactiveValue<unknown>>;
  updater: (val: unknown) => void;
  debugType: BindingDebugType;
}

let activeBatchCollector: BatchedTask[] | null = null;

export function withBatchCollection(fn: () => void): BatchedTask[] {
  const previous = activeBatchCollector;
  const current: BatchedTask[] = [];
  activeBatchCollector = current;
  try {
    fn();
  } finally {
    activeBatchCollector = previous;
  }
  return current;
}

/**
 * Logic: Monotonic Async Race Protection
 *
 * Strategy:
 * Assigns an incrementing ID to each update. If a promise resolves after a
 * newer update has started, the stale result is discarded to prevent UI flicker.
 *
 * @internal
 */
/**
 * Resolves the current value of a source (atom, function, or static value).
 * @internal
 */
const getSourceValue = <T>(source: AsyncReactiveValue<T>): T | Promise<T> => {
  if (isAtom(source)) return (source as ReadonlyAtom<T | Promise<T>>).value;
  if (typeof source === 'function') return (source as () => T | Promise<T>)();
  return source as T | Promise<T>;
};

function createAsyncRunner<T>(
  el: Element,
  debugType: BindingDebugType,
  updater: (value: T) => void
) {
  let activeVersion = 0;
  let isDisposed = false;
  let cleanupRegistered = false;

  const runUpdate = (value: T, isAsync: boolean) => {
    if (isDisposed) return;
    untracked(() => {
      try {
        updater(value);
        debug.domUpdated(
          SYSTEM_BINDING.PREFIX,
          el,
          isAsync ? `${debugType} (async)` : debugType,
          value
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

    if (!cleanupRegistered) {
      registry.onCleanup(el, () => {
        isDisposed = true;
      });
      cleanupRegistered = true;
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
  el: Element,
  source: AsyncReactiveValue<T>,
  updater: (value: T) => void,
  debugType: BindingDebugType
): void {
  if (activeBatchCollector) {
    activeBatchCollector.push({
      source: source as unknown as AsyncReactiveValue<unknown>,
      updater: updater as unknown as (val: unknown) => void,
      debugType,
    });
    return;
  }

  const runner = createAsyncRunner(el, debugType, updater);

  if (isAtom(source) || typeof source === 'function') {
    registry.trackEffect(
      el,
      effect(() => runner(getSourceValue(source)), { name: debugType })
    );
  } else {
    runner(source as T | Promise<T>);
  }
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
  el: Element,
  sourceMap: Record<string, AsyncReactiveValue<T>>,
  updater: (map: Record<string, T>) => void,
  debugType: BindingDebugType
): void {
  if (activeBatchCollector) {
    activeBatchCollector.push({
      sourceMap: sourceMap as unknown as Record<string, AsyncReactiveValue<unknown>>,
      updater: updater as unknown as (val: unknown) => void,
      debugType,
    });
    return;
  }

  const runner = createAsyncRunner(el, debugType, updater);
  const keys = Object.keys(sourceMap);

  /** Pre-check if any source in the map is reactive. */
  let hasReactive = false;
  for (const key of keys) {
    const val = sourceMap[key];
    if (isAtom(val) || typeof val === 'function') {
      hasReactive = true;
      break;
    }
  }

  /** Collects current values from the map in a single pass. */
  const collect = () => {
    const resolved: Record<string, T> = {};
    const promises: Promise<{ key: string; value: T }>[] = [];

    for (const key of keys) {
      const value = getSourceValue(sourceMap[key]);

      if (isPromise(value)) {
        promises.push((value as Promise<T>).then((v) => ({ key, value: v })));
      } else {
        resolved[key] = value as T;
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then((results) => {
        for (const res of results) {
          resolved[res.key] = res.value;
        }
        return resolved;
      });
    }
    return resolved;
  };

  if (hasReactive) {
    registry.trackEffect(
      el,
      effect(() => runner(collect()), { name: debugType })
    );
  } else {
    runner(collect());
  }
}

const collectMap = (
  sourceMap: Record<string, AsyncReactiveValue<unknown>>,
  keys: string[]
): Record<string, unknown> | Promise<Record<string, unknown>> => {
  const resolved: Record<string, unknown> = {};
  const promises: Promise<{ key: string; value: unknown }>[] = [];

  for (const key of keys) {
    const value = getSourceValue(sourceMap[key]);

    if (isPromise(value)) {
      promises.push((value as Promise<unknown>).then((v) => ({ key, value: v })));
    } else {
      resolved[key] = value;
    }
  }

  if (promises.length > 0) {
    return Promise.all(promises).then((results) => {
      for (const res of results) {
        resolved[res.key] = res.value;
      }
      return resolved;
    });
  }
  return resolved;
};

const isReactive = (val: unknown): boolean => isAtom(val) || typeof val === 'function';

export function registerBatchedEffects(el: Element, tasks: BatchedTask[]): void {
  let hasReactive = false;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t) {
      if (t.sourceMap) {
        const values = Object.values(t.sourceMap);
        for (let j = 0; j < values.length; j++) {
          if (isReactive(values[j])) {
            hasReactive = true;
            break;
          }
        }
      } else if ('source' in t && isReactive(t.source)) {
        hasReactive = true;
      }
    }
    if (hasReactive) break;
  }

  const runners = tasks.map((t) => {
    const runner = createAsyncRunner(el, t.debugType, t.updater);
    const sourceMap = t.sourceMap;
    if (sourceMap) {
      const keys = Object.keys(sourceMap);
      return () => runner(collectMap(sourceMap, keys));
    }
    if ('source' in t) {
      return () => runner(getSourceValue(t.source));
    }
    return () => {};
  });

  if (hasReactive) {
    registry.trackEffect(
      el,
      effect(
        () => {
          for (let i = 0; i < runners.length; i++) {
            runners[i]?.();
          }
        },
        { name: 'batch' }
      )
    );
  } else {
    for (let i = 0; i < runners.length; i++) {
      runners[i]?.();
    }
  }
}
