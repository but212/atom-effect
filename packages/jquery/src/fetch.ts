import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchOptions } from './types';

/**
 * Connects an AbortSignal to a jQuery XHR so that aborting the signal
 * cancels the request. Handles the race window where abort() fires between
 * $.ajax() and addEventListener() by checking signal.aborted synchronously.
 * Returns a cleanup function to remove the listener.
 */
function linkXhrToSignal(xhr: JQuery.jqXHR, signal: AbortSignal): () => void {
  const handler = () => xhr.abort();
  signal.addEventListener('abort', handler);
  if (signal.aborted) {
    xhr.abort();
  }
  return () => signal.removeEventListener('abort', handler);
}

/**
 * A promise that never resolves, used to keep a computed in the pending
 * state after an aborted request — until the next run supersedes it.
 */
const PENDING = new Promise<never>(() => {});

/**
 * Creates a reactive fetch atom that auto-refetches when reactive dependencies change.
 *
 * Wraps core's async `computed` with jQuery's `$.ajax`.
 * Returns a standard `ComputedAtom<T>` with `isPending`, `hasError`, `invalidate()`, etc.
 */
$.extend({
  atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
    const { defaultValue, transform, method, headers, ajaxOptions } = options;
    const getUrl = typeof urlOrFn === 'function' ? urlOrFn : () => urlOrFn;

    let abortController: AbortController | null = null;

    return computed(
      async () => {
        abortController?.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const xhr = $.ajax({ ...ajaxOptions, url: getUrl(), method, headers });
        const unlinkSignal = linkXhrToSignal(xhr, signal);

        try {
          const raw = await xhr;
          return transform ? transform(raw) : (raw as T);
        } catch (err) {
          // Rejection from xhr.abort() — treat as cancellation, not a real error.
          if (signal.aborted) return PENDING as unknown as T;
          throw err;
        } finally {
          unlinkSignal();
          if (abortController?.signal === signal) abortController = null;
        }
      },
      { defaultValue, lazy: false }
    );
  },
});
