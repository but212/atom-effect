import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from '@/types';

/**
 * Derives JQuery.AjaxSettings from FetchOptions.
 * Data-focused transformation without hidden state.
 *
 * Transforms high-level FetchOptions into standard jQuery.AjaxSettings.
 * Logic: Forces callback removal (success/error/complete) to ensure
 * the library’s internal async orchestration remains the single source of truth.
 */
function getAjaxSettings<T>(getUrl: () => string, options: FetchOptions<T>): JQuery.AjaxSettings {
  const baseAjax = typeof options.ajaxOptions === 'object' ? options.ajaxOptions : {};
  const dynamicOptions = typeof options.ajaxOptions === 'function' ? options.ajaxOptions() : {};

  return {
    ...baseAjax,
    ...dynamicOptions,
    url: getUrl(),
    method: options.method || dynamicOptions.method || baseAjax.method,
    headers: {
      ...(baseAjax as JQuery.AjaxSettings)?.headers,
      ...options.headers,
      ...dynamicOptions.headers,
    },
    // Reset callbacks to prevent interference with atom-effect's internal lifecycle logic
    success: undefined,
    error: undefined,
    complete: undefined,
  };
}

/**
 * Normalizes jQuery-specific jqXHR errors into standard JS Error objects.
 * Logic: Preserves the original jqXHR instance on the error object for
 * advanced debugging/logging in the 'onError' hook.
 */
function handleFetchError(err: unknown, onError?: (err: unknown) => void): never {
  let final: Error;

  if (err && typeof (err as JQuery.jqXHR).readyState !== 'undefined') {
    const x = err as JQuery.jqXHR;
    final = new Error(`Network Error: ${x.statusText || 'Unknown'} (${x.status})`);
    (final as FetchError).jqXHR = x;
  } else {
    final = err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
  }

  if (onError) {
    try {
      onError(final);
    } catch {
      // Logic: Ignore user-hook errors to prevent breaking the core fetch promise chain.
    }
  }
  throw final;
}

/**
 * Creates a reactive fetch atom powered by jQuery.ajax.
 *
 * When to use:
 * - Best for fetching data that depends on other reactive stores (e.g., search queries, ID-based details).
 *
 * Built-in Features:
 * 1. Concurrency Management: Automatically aborts the previous request if the URL/atom re-evaluates.
 * 2. Lifecycle Cleanup: Terminates any pending network request when the atom is disposed.
 * 3. Reactive Integration: Exposes the result as a standard ComputedAtom.
 *
 * @example
 * const userId = $.atom(123);
 * const user = $.atomFetch(() => `/api/users/${userId.value}`, {
 *   defaultValue: { name: 'Loading...' },
 *   eager: true
 * });
 *
 * $.effect(() => console.log(user.value.name));
 */
function atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
  const getUrl = typeof urlOrFn === 'string' ? () => urlOrFn : urlOrFn;
  let abortController: AbortController | null = null;

  const execute = async (): Promise<T> => {
    // Logic: Aborts the previous execution to prevent out-of-order async race conditions.
    abortController?.abort();

    const controller = new AbortController();
    abortController = controller;
    const { signal } = controller;

    const settings = getAjaxSettings(getUrl, options);
    let xhr: JQuery.jqXHR | undefined;
    let onAbort: (() => void) | undefined;

    try {
      xhr = $.ajax(settings);
      const currentXhr = xhr;
      onAbort = () => currentXhr.abort();
      signal.addEventListener('abort', onAbort);

      if (signal.aborted) currentXhr.abort();

      const raw = await currentXhr;
      return options.transform ? options.transform(raw, currentXhr) : (raw as T);
    } catch (err) {
      if (signal.aborted) {
        const e = new Error('AbortError');
        e.name = 'AbortError';
        throw e;
      }
      return handleFetchError(err, options.onError);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
      if (abortController === controller) {
        abortController = null;
      }
    }
  };

  const atomVal = computed(execute, {
    defaultValue: options.defaultValue,
    lazy: options.eager === false,
    ...(options.name !== undefined ? { name: options.name } : {}),
  });

  // Lifecycle: Ensures the network request is canceled when the atom itself is destroyed.
  const originalDispose = atomVal.dispose.bind(atomVal);
  atomVal.dispose = () => {
    abortController?.abort();
    originalDispose();
  };

  return Object.assign(atomVal, {
    abort: () => abortController?.abort(),
  }) as ComputedAtom<T> & { abort: () => void };
}

$.extend({
  atomFetch,
});
