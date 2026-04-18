import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from '@/types';

/**
 * Derives JQuery.AjaxSettings from FetchOptions.
 * Data-focused transformation without hidden state.
 */
function getAjaxSettings<T>(getUrl: () => string, options: FetchOptions<T>): JQuery.AjaxSettings {
  const baseAjax = typeof options.ajaxOptions === 'object' ? options.ajaxOptions : {};
  const dynamicOptions = typeof options.ajaxOptions === 'function' ? options.ajaxOptions() : {};

  return {
    ...baseAjax,
    ...dynamicOptions,
    url: getUrl(),
    method: options.method || baseAjax.method,
    headers: {
      ...(baseAjax as JQuery.AjaxSettings)?.headers,
      ...options.headers,
      ...dynamicOptions.headers,
    },
    // Reset callbacks to prevent interference with atom-effect's logic
    success: undefined,
    error: undefined,
    complete: undefined,
  };
}

/**
 * Handles fetch errors by normalizing them and triggering the onError hook.
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
      // Ignore user-defined hook errors during error handling
    }
  }
  throw final;
}

/**
 * atomFetch: A reactive fetch atom that wraps jQuery.ajax.
 * Simplicity over complexity: No classes, just data and functions.
 */
function atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
  const getUrl = typeof urlOrFn === 'string' ? () => urlOrFn : urlOrFn;
  let abortController: AbortController | null = null;

  const execute = async (): Promise<T> => {
    // Cancel previous execution if still pending
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
