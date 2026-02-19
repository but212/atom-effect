import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchOptions } from './types';

/**
 * A Promise that never settles, used to keep a computed atom in its pending
 * state after an aborted request — until the next reactive run supersedes it.
 *
 * When the async computed fn returns this value, core treats the run as still
 * in-flight (pending flag stays set) without resolving or rejecting. The next
 * run (triggered by invalidate() or a dependency change) replaces this state.
 *
 * Typed as `Promise<never>` so it can be widened to `Promise<T>` at the call
 * site without an `as unknown` double-cast — `never` is assignable to any `T`.
 *
 * Intentional module-level singleton: the Promise executor never resolves or
 * rejects, so the object is permanently live. This is expected and safe —
 * there are no closures over external references that would prevent GC of other
 * objects.
 */
const NEVER_SETTLE = new Promise<never>(() => {});

// ============================================================================
// atomFetch
// ============================================================================

$.extend({
  atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
    const { defaultValue, transform, method, headers, ajaxOptions, onError, eager } = options;

    // Hoist 1: Determine URL getter once.
    const getUrl = typeof urlOrFn === 'function' ? urlOrFn : null;
    const staticUrl = typeof urlOrFn === 'string' ? urlOrFn : undefined;

    // Hoist 2: Pre-merge static options to avoid repeated object spreads per request.
    const baseOptions = {
      ...ajaxOptions,
      ...(method !== undefined && { method }),
      ...(headers !== undefined && { headers }),
    };

    let abortController: AbortController | null = null;

    return computed(
      async () => {
        abortController?.abort();
        abortController = new AbortController();
        const signal = abortController.signal;

        // Optimization: Use pre-merged options.
        // If staticUrl is present, it's used; otherwise getUrl() is called.
        // jQuery's ajax settings object is mutable but $.ajax copies it.
        // We create a fresh object here to be safe and reactive-friendly.
        const reqOptions = staticUrl
          ? { ...baseOptions, url: staticUrl }
          : { ...baseOptions, url: getUrl!() };

        const xhr = $.ajax(reqOptions);

        // Optimization: Use onabort property directly instead of addEventListener
        // to avoid the overhead of the EventTarget registry.
        // This signal is fresh per request and private to this scope.
        signal.onabort = () => xhr.abort();
        if (signal.aborted) xhr.abort();

        try {
          const raw = await xhr;
          return transform ? transform(raw) : (raw as T);
        } catch (err) {
          if (signal.aborted) {
            return NEVER_SETTLE as Promise<T>;
          }
          try {
            onError?.(err);
          } catch {
            // Ignore
          }
          throw err;
        } finally {
          signal.onabort = null; // Cleanup
          if (abortController.signal === signal) abortController = null;
        }
      },
      { defaultValue, lazy: !(eager ?? true) }
    );
  },
});
