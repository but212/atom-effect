import { effect, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { AsyncReactiveValue } from '@/types';

import { hasOwn, isPromise, isReactive } from '@/utils';
import { debug } from '@/utils/debug';

// ============================================================================
// Debug type
// ============================================================================

/**
 * Structured label identifying which binding produced a debug log entry.
 * Fixed bindings use a plain literal; per-key bindings use a `prefix.key` form
 * where the key portion must be non-empty.
 *
 * Note: the trailing `(string & {})` member makes this type accept any string
 * at runtime while still surfacing the named literals as IDE autocomplete
 * suggestions. It does NOT enforce that only the listed values are used —
 * TypeScript absorbs all narrower literal members into `string & {}`, so there
 * is no compile-time restriction beyond `string`.
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

// ============================================================================
// Core factory
// ============================================================================

/**
 * Registers a reactive effect that calls `updater` whenever `source` changes,
 * or calls `updater` once immediately if `source` is a static value.
 *
 * Responsibilities:
 * - Reactive path: wraps `updater` in an `effect`, tracks it on the registry.
 * - Static path: applies the value once; no effect is registered.
 * - Debug path: logs both the static initial bind and reactive updates via
 *   `debug.domUpdated` so that all DOM writes appear in a uniform format.
 * - Error path: catches `updater` exceptions and surfaces them via `console.error`
 *   so that a broken binding does not silently kill the effect loop.
 *   Both the reactive and static paths are guarded consistently with `untracked`.
 *
 * @param el        DOM element or SVG element to associate the effect with.
 * @param source    Reactive or static value source.
 * @param updater   Function that writes the value to the DOM.
 * @param debugType Structured label used in debug log output and effect naming.
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

  // Ensure zombie protection by registering cleanup immediately.
  // Covers all execution paths, including static Promise inputs.
  registry.trackCleanup(el, () => {
    state.isDisposed = true;
  });

  const runUpdater = (val: T | Promise<T>) => {
    // Sync Path: Update immediately and invalidate any pending async runs.
    if (!isPromise(val)) {
      state.latestId++;
      untracked(() => {
        try {
          updater(val);
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, val);
        } catch (e) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true), e);
        }
      });
      return;
    }

    // Async Path: Increment ID to track this specific execution's relevance.
    const myId = ++state.latestId;
    val
      .then((resolved) => {
        // Execute only if this element is still connected and this promise is still current.
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

  const sourceIsReactive = isReactive(source);
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
 * Registers a single reactive effect that observes multiple sources in a map.
 * When any source changes, the entire map is re-processed via the updater.
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
    const isAtomVal = isReactive(val);
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
    cache: {} as Record<string, { p: Promise<T>; v: T }>,
  };

  // Ensure zombie protection by registering cleanup immediately.
  registry.trackCleanup(el, () => {
    state.isDisposed = true;
  });

  const runUpdater = (currentMap: Record<string, T | Promise<T>>) => {
    const promises: Promise<{ key: string; val: T }>[] = [];
    const resolvedMap: Record<string, T> = {};
    const len = keys.length;

    for (let i = 0; i < len; i++) {
      const key = keys[i]!;
      const val = currentMap[key]!;

      // Optimization: use cached result if it matches the current promise instance.
      if (isPromise(val) && hasOwn.call(state.cache, key)) {
        const entry = state.cache[key]!;
        if (entry.p === val) {
          resolvedMap[key] = entry.v;
          continue;
        }
      }

      if (isPromise(val)) {
        promises.push(
          val.then((v) => {
            state.cache[key] = { p: val as Promise<T>, v };
            return { key, val: v };
          })
        );
      } else {
        resolvedMap[key] = val as T;
      }
    }

    if (promises.length > 0) {
      const myId = ++state.latestId;
      Promise.all(promises).then(
        (results) => {
          if (myId === state.latestId && !state.isDisposed) {
            for (let i = 0, rLen = results.length; i < rLen; i++) {
              const res = results[i]!;
              resolvedMap[res.key] = res.val;
            }
            untracked(() => {
              try {
                updater(resolvedMap);
                debug.domUpdated(LOG_PREFIXES.BINDING, el, `${debugType} (async)`, resolvedMap);
              } catch (e) {
                debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
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
      // Sync Path: Update immediately and invalidate any pending async runs.
      state.latestId++;
      untracked(() => {
        try {
          updater(resolvedMap);
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, resolvedMap);
        } catch (e) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true), e);
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
          for (let i = 0, rLen = reactiveKeys.length; i < rLen; i++) {
            const source = reactiveSources[i]!;
            currentMap[reactiveKeys[i]!] = sourceIsAtom[i]
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
