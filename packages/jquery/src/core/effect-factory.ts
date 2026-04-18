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
