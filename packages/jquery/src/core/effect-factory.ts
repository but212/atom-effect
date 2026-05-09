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

/**
 * Creates an execution wrapper that manages asynchronous race conditions.
 *
 * Logic: Monotonic ID Tracking
 * Every update request is assigned a unique, incrementing ID. If a promise resolves
 * but its ID no longer matches the latest issued ID, the result is discarded.
 *
 * @param el - The target element for the update.
 * @param debugType - The type of binding for logging purposes.
 * @param updater - The callback to execute when a value is ready.
 * @returns A function that accepts a value or a promise.
 * @internal
 */
function createAsyncRunner<T>(
  el: Element,
  debugType: BindingDebugType,
  updater: (value: T) => void
) {
  let latestId = 0;
  let isDisposed = false;

  registry.onCleanup(el, () => {
    isDisposed = true;
  });

  return (value: T | Promise<T>) => {
    const currentId = ++latestId;

    if (!isPromise(value)) {
      // Sync Path: Direct execution to minimize overhead
      if (isDisposed || currentId !== latestId) return;

      untracked(() => {
        try {
          updater(value);
          debug.domUpdated(SYSTEM_BINDING.PREFIX, el, debugType, value);
        } catch (error) {
          debug.error(
            SYSTEM_BINDING.PREFIX,
            SYSTEM_BINDING.ERRORS.UPDATER_ERROR(debugType, true),
            error
          );
        }
      });
      return;
    }

    // Async Path
    value.then(
      (resolved) => {
        if (isDisposed || currentId !== latestId) return;
        untracked(() => {
          try {
            updater(resolved);
            debug.domUpdated(SYSTEM_BINDING.PREFIX, el, `${debugType} (async)`, resolved);
          } catch (error) {
            debug.error(
              SYSTEM_BINDING.PREFIX,
              SYSTEM_BINDING.ERRORS.UPDATER_ERROR(debugType, false),
              error
            );
          }
        });
      },
      (error) => {
        // Caution: Network or source errors are logged if they are still relevant.
        if (currentId === latestId && !isDisposed) {
          debug.error(SYSTEM_BINDING.PREFIX, SYSTEM_BINDING.ERRORS.UPDATER_ERROR(debugType), error);
        }
      }
    );
  };
}

/**
 * Establishes a reactive effect between a single source and a DOM element.
 *
 * Lifecycle: The created effect is automatically registered with the global
 * `registry` and linked to the target element.
 *
 * @param el - The target DOM element.
 * @param source - The reactive atom, function, or static value.
 * @param updater - The function that applies the value to the DOM.
 * @param debugType - Metadata for debugging.
 * @internal
 */
export function registerReactiveEffect<T>(
  el: Element,
  source: AsyncReactiveValue<T>,
  updater: (value: T) => void,
  debugType: BindingDebugType
): void {
  const runner = createAsyncRunner(el, debugType, updater);

  const isReactive = isAtom(source);
  const isFunction = typeof source === 'function';

  if (isReactive || isFunction) {
    registry.trackEffect(
      el,
      effect(
        () => {
          const value = isReactive
            ? (source as ReadonlyAtom<T | Promise<T>>).value
            : (source as () => T | Promise<T>)();
          runner(value);
        },
        { name: debugType }
      )
    );
  } else {
    runner(source as T | Promise<T>);
  }
}

/**
 * Establishes a reactive effect between a map of sources and a DOM element.
 *
 * Optimization: Single-pass Collection
 * Replaces multiple array methods (map/filter/forEach) with a single for-loop
 * to reduce memory allocation and GC pressure on every state change.
 *
 * @param el - The target DOM element.
 * @param sourceMap - A record of property keys and reactive values.
 * @param updater - The function that applies the entire map to the DOM.
 * @param debugType - Metadata for debugging.
 * @internal
 */
export function registerMapEffect<T>(
  el: Element,
  sourceMap: Record<string, AsyncReactiveValue<T>>,
  updater: (map: Record<string, T>) => void,
  debugType: BindingDebugType
): void {
  const runner = createAsyncRunner(el, debugType, updater);
  const keys = Object.keys(sourceMap);
  const len = keys.length;

  /** Pre-check if any source in the map is reactive. */
  let hasReactive = false;
  for (let i = 0; i < len; i++) {
    const val = sourceMap[keys[i]!];
    if (isAtom(val) || typeof val === 'function') {
      hasReactive = true;
      break;
    }
  }

  /** Collects current values from the map in a single pass. */
  const collect = () => {
    const resolved: Record<string, T> = {};
    const promises: Promise<{ key: string; value: T }>[] = [];

    for (let i = 0; i < len; i++) {
      const key = keys[i]!;
      const source = sourceMap[key];

      let value: T | Promise<T>;
      if (isAtom(source)) {
        value = (source as ReadonlyAtom<T | Promise<T>>).value;
      } else if (typeof source === 'function') {
        value = (source as Function)();
      } else {
        value = source as T | Promise<T>;
      }

      if (isPromise(value)) {
        promises.push(value.then((v) => ({ key, value: v })));
      } else {
        resolved[key] = value as T;
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then((results) => {
        for (let i = 0, rLen = results.length; i < rLen; i++) {
          const res = results[i]!;
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
