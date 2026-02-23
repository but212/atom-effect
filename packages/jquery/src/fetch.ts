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
    const isStaticUrl = typeof urlOrFn === 'string';
    const staticUrl = isStaticUrl ? urlOrFn : undefined;
    const getUrl = isStaticUrl ? null : urlOrFn;

    // Hoist 2: Pre-merge static options to avoid repeated object spreads per request.
    const reqOptions: JQuery.AjaxSettings = Object.assign({}, ajaxOptions);
    if (method !== undefined) reqOptions.method = method;
    if (headers !== undefined) reqOptions.headers = headers;

    if (isStaticUrl) {
      reqOptions.url = staticUrl;
    }

    let abortController: AbortController | null = null;
    const isLazy = !(eager ?? true);

    return computed(
      async () => {
        abortController?.abort();
        abortController = new AbortController();
        const signal = abortController.signal;

        if (!isStaticUrl) {
          reqOptions.url = getUrl!();
        }

        const xhr = $.ajax(reqOptions);

        signal.onabort = () => xhr.abort();
        if (signal.aborted) xhr.abort();

        let raw: unknown;
        try {
          raw = await xhr;
        } catch (err) {
          if (signal.aborted) {
            return NEVER_SETTLE as Promise<T>;
          }
          // Network / server error — notify the caller via onError.
          try {
            onError?.(err);
          } catch {
            // Ignore errors thrown by onError itself.
          }
          throw err;
        } finally {
          signal.onabort = null;
          if (abortController.signal === signal) abortController = null;
        }

        // Transform errors are kept separate from network errors so that
        // onError is not called for bugs in the transform function itself.
        return transform ? transform(raw) : (raw as T);
      },
      { defaultValue, lazy: isLazy }
    );
  },
});
