import { effect, isAtom, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { Option, Result } from '@but212/atom-effect-utils';
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
 * This effectively prevents "out-of-order" race conditions where stale data
 * could overwrite newer state.
 *
 * Lifecycle: The runner monitors the element's lifecycle through the registry
 * and prevents updates if the element has been disposed.
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

  /** Internal helper to execute the updater with Result tracking. */
  const applyUpdate = (val: T, isSync: boolean, targetId: number) => {
    // Logic: Discard results if a newer update was initiated or the element was removed.
    if (isDisposed || targetId !== latestId) return;

    untracked(() => {
      const result = Result.tryCatch(() => updater(val));

      Result.match(result, {
        ok: () => {
          const suffix = isSync ? '' : ' (async)';
          debug.domUpdated(SYSTEM_BINDING.PREFIX, el, `${debugType}${suffix}`, val);
        },
        err: (error) => {
          debug.error(
            SYSTEM_BINDING.PREFIX,
            SYSTEM_BINDING.ERRORS.UPDATER_ERROR(debugType, isSync),
            error
          );
        },
      });
    });
  };

  return (value: T | Promise<T>) => {
    const currentId = ++latestId;

    if (!isPromise(value)) {
      applyUpdate(value, true, currentId);
      return;
    }

    value.then(
      (resolved) => applyUpdate(resolved, false, currentId),
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
 * `registry` and linked to the target element, ensuring it is disposed of
 * when the element is removed from the DOM.
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
    // Logic: Static values are handled directly via the runner to support initial sync.
    runner(source as T | Promise<T>);
  }
}

/**
 * Establishes a reactive effect between a map of sources and a DOM element.
 *
 * Optimization: Batch Resolution
 * Aggregates multiple asynchronous sources into a single `Promise.all` resolution.
 * This minimizes DOM thrashing by ensuring the UI update only occurs once all
 * parts of the map are ready.
 *
 * @param el - The target DOM element.
 * @param map - A record of property keys and reactive values.
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
  const entries = Object.entries(sourceMap);

  let hasReactive = false;
  for (let i = 0, len = entries.length; i < len; i++) {
    const value = entries[i]![1];
    if (isAtom(value) || typeof value === 'function') {
      hasReactive = true;
      break;
    }
  }

  /** Collects current values from the map and resolves any pending promises. */
  const collect = () => {
    const resolved: Record<string, T> = {};

    const items = entries.map(([key, source]) => {
      const value = isAtom(source)
        ? (source as ReadonlyAtom<T | Promise<T>>).value
        : Option.unwrapOr(
            Option.map(
              Option.fromNullable(typeof source === 'function' ? source : null),
              (fn: Function) => fn()
            ),
            source as T | Promise<T>
          );
      return { key, value };
    });

    // Separate promises and static values.
    const promises = items
      .filter((i) => isPromise(i.value))
      .map((i) => (i.value as Promise<T>).then((v) => ({ key: i.key, value: v })));

    items.filter((i) => !isPromise(i.value)).forEach((i) => (resolved[i.key] = i.value as T));

    if (promises.length > 0) {
      return Promise.all(promises).then((results) => {
        results.forEach((r) => (resolved[r.key] = r.value));
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
