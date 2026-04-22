import { effect, isAtom, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { AsyncReactiveValue } from '@/types';

import { isPromise } from '@/utils';
import { debug } from '@/utils/debug';

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
 * Internal helper to manage asynchronous race conditions and DOM lifecycle cleanup.
 *
 * Logic: Monotonic ID Tracking
 * - Assigns a unique, incrementing ID to every update request.
 * - Discards resolved promises if a newer update ID has been issued,
 *   effectively solving the "out-of-order" async racing problem.
 *
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
      untracked(() => {
        try {
          updater(value);
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, value);
        } catch (error) {
          debug.error(
            LOG_PREFIXES.BINDING,
            ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true),
            error
          );
        }
      });
      return;
    }

    value
      .then((resolved) => {
        if (currentId === latestId && !isDisposed) {
          untracked(() => {
            try {
              updater(resolved);
              debug.domUpdated(LOG_PREFIXES.BINDING, el, `${debugType} (async)`, resolved);
            } catch (error) {
              debug.error(
                LOG_PREFIXES.BINDING,
                ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType),
                error
              );
            }
          });
        }
      })
      .catch((error) => {
        if (currentId === latestId && !isDisposed) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), error);
        }
      });
  };
}

/**
 * Lifecycle:
 * - Automatically registers the created `effect` with the global `registry`
 *   linked to the target element.
 * - Ensures that the effect is disposed of when the element is removed or cleaned.
 *
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
 * Logic: Batch Resolution
 * - Detects if any property in the map is reactive (Atom or Function).
 * - Aggregates multiple async sources into a single `Promise.all` resolution
 *   to minimize DOM thrashing and ensure atomic UI updates.
 *
 * @internal
 */
export function registerMapEffect<T>(
  el: Element,
  map: Record<string, AsyncReactiveValue<T>>,
  updater: (map: Record<string, T>) => void,
  debugType: BindingDebugType
): void {
  const runner = createAsyncRunner(el, debugType, updater);
  const entries = Object.entries(map);

  let hasReactive = false;
  for (let i = 0, len = entries.length; i < len; i++) {
    const value = entries[i]![1];
    if (isAtom(value) || typeof value === 'function') {
      hasReactive = true;
      break;
    }
  }

  const collect = () => {
    const promises: Promise<{ key: string; value: T }>[] = [];
    const resolved: Record<string, T> = {};

    for (let i = 0, len = entries.length; i < len; i++) {
      const [key, source] = entries[i]!;
      const value = isAtom(source)
        ? (source as ReadonlyAtom<T | Promise<T>>).value
        : typeof source === 'function'
          ? (source as () => T | Promise<T>)()
          : (source as T | Promise<T>);

      if (isPromise(value)) {
        promises.push(value.then((v) => ({ key, value: v })));
      } else {
        resolved[key] = value as T;
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then((results) => {
        for (let i = 0, len = results.length; i < len; i++) {
          const result = results[i]!;
          resolved[result.key] = result.value;
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
