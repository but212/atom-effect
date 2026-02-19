import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchOptions } from './types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Connects an AbortSignal to a jQuery XHR so that aborting the signal
 * cancels the in-flight request.
 *
 * Handles the race window where `abort()` fires between `$.ajax()` and
 * `addEventListener()` by checking `signal.aborted` synchronously after
 * attaching the listener.
 *
 * Returns a cleanup function that removes the listener.
 */
function linkXhrToSignal(xhr: JQuery.jqXHR, signal: AbortSignal): () => void {
  const handler = () => xhr.abort();
  signal.addEventListener('abort', handler);
  if (signal.aborted) xhr.abort();
  return () => signal.removeEventListener('abort', handler);
}

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

    // When urlOrFn is a reactive function, calling it inside the computed fn
    // registers it as a dependency — URL changes automatically trigger a refetch.
    // When it is a plain string there is no dependency to track; wrapping it in
    // a function keeps the call site uniform without observable overhead.
    const getUrl = typeof urlOrFn === 'function' ? urlOrFn : () => urlOrFn;

    // Holds the AbortController for the currently in-flight request.
    // The local `signal` captured inside the async fn is used for abort
    // detection in the catch block; `abortController` is only written
    // from the sync portion (before any `await`), so there is no async write race.
    let abortController: AbortController | null = null;

    return computed(
      async () => {
        // Cancel the previous in-flight request before starting a new one.
        abortController?.abort();
        abortController = new AbortController();

        // Capture signal locally so the catch block can safely read it
        // even after `abortController` has been replaced by a newer run.
        const signal = abortController.signal;

        // Build the ajax options object. Precedence (highest → lowest):
        //   url (always from getUrl()), method, headers, ajaxOptions.
        // Explicit `method`/`headers` options override any same-named keys in
        // `ajaxOptions`. Undefined top-level options are omitted entirely so
        // they do not shadow keys already present in `ajaxOptions`.
        const xhr = $.ajax({
          ...ajaxOptions,
          url: getUrl(),
          ...(method !== undefined && { method }),
          ...(headers !== undefined && { headers }),
        });
        const unlinkSignal = linkXhrToSignal(xhr, signal);

        try {
          const raw = await xhr;
          // When transform is omitted the raw response is cast to T.
          // Callers are responsible for ensuring the server shape matches T,
          // or should provide a transform function for runtime validation.
          return transform ? transform(raw) : (raw as T);
        } catch (err) {
          if (signal.aborted) {
            // This run was superseded by a newer request. Return NEVER_SETTLE
            // to keep the computed in its pending state until the newer run
            // resolves — suppressing this abort as an error.
            // `never` is assignable to T so no `as unknown` double-cast is needed.
            return NEVER_SETTLE as Promise<T>;
          }
          // onError is notification-only (returns void) — it cannot suppress the
          // error. The throw below always propagates so the computed transitions
          // to its rejected state regardless of whether onError is provided.
          // onError is wrapped in try/catch so a throwing callback cannot
          // replace the original error with its own exception.
          try {
            onError?.(err);
          } catch {
            // Ignore — original error is re-thrown below.
          }
          throw err;
        } finally {
          unlinkSignal();
          // Clear the controller reference only if it still belongs to this
          // run. A newer run may have already replaced it.
          if (abortController.signal === signal) abortController = null;
        }
      },
      // eager defaults to true — atomFetch fires the first request immediately.
      // Negate to get the lazy flag that computed() expects.
      { defaultValue, lazy: !(eager ?? true) }
    );
  },
});
