import { effect, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { AsyncReactiveValue } from '@/types';

import { isPromise, isReactive } from '@/utils';
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
  let latestPromise: Promise<T> | null = null;

  const runUpdater = (val: T | Promise<T>) => {
    if (!isPromise(val)) {
      latestPromise = null;
      try {
        updater(val);
        if (debug.enabled) {
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, val);
        }
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true), e);
      }
      return;
    }

    latestPromise = val;
    val
      .then((resolved) => {
        // Ensure this is still the most recent promise to avoid race conditions
        if (latestPromise === val) {
          untracked(() => {
            try {
              updater(resolved);
              if (debug.enabled) {
                debug.domUpdated(LOG_PREFIXES.BINDING, el, `${debugType} (async)`, resolved);
              }
            } catch (e) {
              debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
            }
          });
        }
      })
      .catch((e) => {
        if (latestPromise === val) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
        }
      });
  };

  /**
   * Decide whether to register a reactive effect or perform a one-time static update.
   *
   * STRATEGY:
   * 1. If it's an Atom or a function, it's considered 'reactive' and wrapped in an effect.
   * 2. If it's a plain value or a Promise, it's 'static' and applied once.
   */
  const sourceIsReactive = isReactive(source);
  const sourceIsFunction = typeof source === 'function';

  if (sourceIsReactive || sourceIsFunction) {
    registry.trackEffect(
      el,
      effect(
        () => {
          // Resolve the current value based on the source type.
          // Both paths subscribe to their respective dependencies automatically.
          const value = sourceIsReactive
            ? (source as ReadonlyAtom<T | Promise<T>>).value
            : (source as () => T | Promise<T>)();

          untracked(() => runUpdater(value));
        },
        { name: debugType }
      )
    );
  } else {
    // Static path: applies the value immediately and doesn't register an effect.
    untracked(() => runUpdater(source as T | Promise<T>));
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
  const staticValues: Record<string, T | Promise<T>> = {};

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]!;
    const val = map[key]!;
    if (isReactive(val) || typeof val === 'function') {
      reactiveKeys.push(key);
    } else {
      staticValues[key] = val;
    }
  }

  let latestPromiseId = 0;

  const runUpdater = (currentMap: Record<string, T | Promise<T>>) => {
    const promises: Promise<{ key: string; val: T }>[] = [];
    const resolvedMap: Record<string, T> = {};
    const len = keys.length;

    for (let i = 0; i < len; i++) {
      const key = keys[i]!;
      const val = currentMap[key]!;
      if (isPromise(val)) {
        promises.push(val.then((v) => ({ key, val: v })));
      } else {
        resolvedMap[key] = val as T;
      }
    }

    const pLen = promises.length;
    if (pLen > 0) {
      const myId = ++latestPromiseId;
      Promise.all(promises).then((results) => {
        if (myId === latestPromiseId) {
          for (let i = 0; i < pLen; i++) {
            const res = results[i]!;
            resolvedMap[res.key] = res.val;
          }
          untracked(() => {
            try {
              updater(resolvedMap);
              if (debug.enabled) {
                debug.domUpdated(LOG_PREFIXES.BINDING, el, `${debugType} (async)`, resolvedMap);
              }
            } catch (e) {
              debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType), e);
            }
          });
        }
      });
    } else {
      latestPromiseId++; // Invalidate any pending promises
      try {
        updater(resolvedMap);
        if (debug.enabled) {
          debug.domUpdated(LOG_PREFIXES.BINDING, el, debugType, resolvedMap);
        }
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.UPDATER_ERROR(debugType, true), e);
      }
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
            const source = map[key]!;
            currentMap[key] = isReactive(source)
              ? (source as ReadonlyAtom<T | Promise<T>>).value
              : (source as () => T | Promise<T>)();
          }
          untracked(() => runUpdater(currentMap));
        },
        { name: debugType }
      )
    );
  } else {
    untracked(() => runUpdater(staticValues));
  }
}
