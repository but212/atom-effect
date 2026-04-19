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
 * Orchestrates a reactive relationship between a single source and a DOM element.
 *
 * Logic:
 * - Race Condition Protection: Uses 'latestId' to ensure that if multiple async updates
 *   trigger in sequence, only the resolution from the MOST RECENT one is applied to the DOM.
 * - Cleanup: Safely ignores resolved promises if the target element was unmounted
 *   (disposed) during the async wait.
 * - Dependency Isolation: Runs the 'updater' inside an 'untracked' block to ensure
 *   reactive tracking doesn't leak into the DOM manipulation logic.
 */
export function registerReactiveEffect<T>(
  el: Element,
  source: AsyncReactiveValue<T>,
  updater: (value: T) => void,
  debugType: BindingDebugType
): void {
  const state = {
    latestId: 0,
    isDisposed: false,
  };

  registry.trackCleanup(el, () => {
    state.isDisposed = true;
  });

  const runUpdater = (val: T | Promise<T>) => {
    if (!isPromise(val)) {
      state.latestId++;
      untracked(() => {
        try {
          updater(val);
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, val);
        } catch (e) {
          debug.error(
            LOG_PREFIXES.BINDING,
            ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true),
            e
          );
        }
      });
      return;
    }

    const myId = ++state.latestId;
    val
      .then((resolved) => {
        // Condition: Stale or Disposed updates are discarded.
        if (myId === state.latestId && !state.isDisposed) {
          untracked(() => {
            try {
              updater(resolved);
              debug.domUpdated(LOG_PREFIXES.BINDING, el, `${debugType} (async)`, resolved);
            } catch (e) {
              debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
            }
          });
        }
      })
      .catch((e) => {
        if (myId === state.latestId && !state.isDisposed) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
        }
      });
  };

  const sourceIsReactive = isAtom(source);
  const sourceIsFunction = typeof source === 'function';

  if (sourceIsReactive || sourceIsFunction) {
    registry.trackEffect(
      el,
      effect(
        () => {
          const value = sourceIsReactive
            ? (source as ReadonlyAtom<T | Promise<T>>).value
            : (source as () => T | Promise<T>)();
          runUpdater(value);
        },
        { name: debugType }
      )
    );
  } else {
    runUpdater(source as T | Promise<T>);
  }
}

/**
 * Orchestrates reactive updates for a collection of values (e.g. classes or styles).
 *
 * Optimization:
 * - Efficiently separates static and reactive keys.
 * - If only static values are passed, it avoids creating a reactive effect entirely.
 * - For async resolution, it waits for all pending promises in the map via
 *   Promise.all before applying a single, atomic update to the DOM.
 */
export function registerMapEffect<T>(
  el: Element,
  map: Record<string, AsyncReactiveValue<T>>,
  updater: (map: Record<string, T>) => void,
  debugType: BindingDebugType
): void {
  const keys = Object.keys(map);
  const reactiveKeys: string[] = [];
  const reactiveSources: AsyncReactiveValue<T>[] = [];
  const sourceIsAtom: boolean[] = [];
  const staticValues: Record<string, T | Promise<T>> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const val = map[key]!;
    const isAtomVal = isAtom(val);
    if (isAtomVal || typeof val === 'function') {
      reactiveKeys.push(key);
      reactiveSources.push(val);
      sourceIsAtom.push(isAtomVal);
    } else {
      staticValues[key] = val;
    }
  }

  const state = {
    latestId: 0,
    isDisposed: false,
  };

  registry.trackCleanup(el, () => {
    state.isDisposed = true;
  });

  const runUpdater = (currentMap: Record<string, T | Promise<T>>) => {
    const promises: Array<Promise<{ key: string; val: T }>> = [];
    const resolvedMap: Record<string, T> = {};

    for (const key in currentMap) {
      const val = currentMap[key]!;
      if (isPromise(val)) {
        promises.push(val.then((v) => ({ key, val: v })));
      } else {
        resolvedMap[key] = val as T;
      }
    }

    if (promises.length > 0) {
      const myId = ++state.latestId;
      Promise.all(promises).then(
        (results) => {
          if (myId === state.latestId && !state.isDisposed) {
            for (let i = 0, len = results.length; i < len; i++) {
              const res = results[i]!;
              resolvedMap[res.key] = res.val;
            }
            untracked(() => {
              try {
                updater(resolvedMap);
                debug.domUpdated(LOG_PREFIXES.BINDING, el, `${debugType} (async)`, resolvedMap);
              } catch (e) {
                debug.error(
                  LOG_PREFIXES.BINDING,
                  ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType),
                  e
                );
              }
            });
          }
        },
        (e) => {
          if (myId === state.latestId && !state.isDisposed) {
            debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
          }
        }
      );
    } else {
      state.latestId++;
      untracked(() => {
        try {
          updater(resolvedMap);
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, resolvedMap);
        } catch (e) {
          debug.error(
            LOG_PREFIXES.BINDING,
            ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true),
            e
          );
        }
      });
    }
  };

  if (reactiveKeys.length > 0) {
    registry.trackEffect(
      el,
      effect(
        () => {
          const currentMap: Record<string, T | Promise<T>> = { ...staticValues };
          for (let i = 0, len = reactiveKeys.length; i < len; i++) {
            const key = reactiveKeys[i]!;
            const source = reactiveSources[i]!;
            currentMap[key] = sourceIsAtom[i]
              ? (source as ReadonlyAtom<T | Promise<T>>).value
              : (source as () => T | Promise<T>)();
          }
          runUpdater(currentMap);
        },
        { name: debugType }
      )
    );
  } else {
    runUpdater(staticValues);
  }
}
