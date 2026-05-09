import { computed } from '@but212/atom-effect';
import { Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from '@/types';

/**
 * Normalizes user configuration into jQuery Ajax settings.
 *
 * Logic: Priority Resolution
 * Precedence is established as follows: Direct Options > Dynamic Options > Static Options.
 *
 * Constraint: Direct callback options (`success`, `error`, `complete`) are
 * explicitly cleared to prevent interference with the automated state
 * transitions and concurrency management.
 *
 * @param url - The target URL.
 * @param options - The fetch configuration options.
 * @returns A normalized JQuery.AjaxSettings object.
 * @internal
 */
function toSettings<T>(url: string, options: FetchOptions<T>): JQuery.AjaxSettings {
  const { ajaxOptions, method, headers } = options;
  const base = typeof ajaxOptions === 'object' ? ajaxOptions : {};
  const dynamic = typeof ajaxOptions === 'function' ? ajaxOptions() : {};

  return {
    ...base,
    ...dynamic,
    url,
    method: method || dynamic.method || base.method,
    headers: { ...base.headers, ...dynamic.headers, ...headers },
    success: undefined,
    error: undefined,
    complete: undefined,
  };
}

/**
 * Normalizes jQuery-specific XHR errors into a standard Error format.
 *
 * Logic: Error Normalization
 * Returns a standard `Error` while preserving the original `jqXHR` context,
 * enabling advanced diagnostics in reactive hooks.
 *
 * @param err - The raw error from jQuery.ajax.
 * @returns A normalized Error object containing XHR metadata.
 * @internal
 */
function toError(err: unknown): Error {
  if (err && typeof err === 'object' && 'readyState' in err) {
    const xhr = err as JQuery.jqXHR;
    // Reason: A status of 0 typically indicates a network timeout or DNS
    // failure where statusText might be empty.
    const message = xhr.statusText || (xhr.status === 0 ? 'Network Error' : 'Request Failed');
    const error = new Error(`Network Error: ${message} (${xhr.status})`);
    (error as FetchError).jqXHR = xhr;
    return error;
  }
  return err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
}

/**
 * Creates a reactive computed atom that synchronizes with an asynchronous network request.
 *
 * When to use:
 * - To fetch data that depends on other atoms (automated refetching on dependency changes).
 * - To implement built-in concurrency management (automated cancellation of stale requests).
 *
 * Logic: Concurrency Control
 * Uses `AbortController` and `jqXHR.abort()` to ensure that only the response
 * from the most recent request is reflected in the atom's state. Older,
 * "out-of-order" responses are discarded to prevent UI flickering.
 *
 * @param source - A static URL string or a reactive function returning a URL.
 * @param options - Configuration for default values, transformation, and error handling.
 * @returns A computed atom augmented with an `abort()` method.
 *
 * @example
 * ```typescript
 * const userId = $.atom(1);
 * const user = $.atomFetch(() => `/api/users/${userId.value}`, {
 *   defaultValue: { name: 'Loading...' },
 *   eager: true
 * });
 *
 * $.effect(() => {
 *   console.log(`Current user: ${user.value.name}`);
 * });
 * ```
 */
function atomFetch<T>(source: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
  const getUrl = typeof source === 'string' ? () => source : source;
  let active: AbortController | null = null;

  const execute = async (): Promise<T> => {
    // Logic: Abort the previous request if a new execution cycle starts.
    active?.abort();
    const controller = new AbortController();
    active = controller;

    let xhr: JQuery.jqXHR | undefined;
    const cleanup = () => {
      if (xhr && typeof xhr.abort === 'function') {
        xhr.abort();
      }
    };

    controller.signal.addEventListener('abort', cleanup);
    if (controller.signal.aborted) {
      cleanup();
    }

    try {
      // Logic: Execute the request and capture the result.
      // Note: We use manual try-catch for the AJAX part to ensure perfect compatibility
      // with jqXHR await behavior, which can be tricky with automated wrappers.
      let ajaxResult: Result<unknown, Error>;
      try {
        // 1. Initialize (capture sync errors for onError hook)
        // Dependency tracking must occur synchronously before the first 'await'.
        const url = getUrl();
        const settings = toSettings(url, options);
        xhr = $.ajax(settings);
        const data = await xhr;
        ajaxResult = Result.ok(data);
      } catch (err) {
        ajaxResult = Result.err(toError(err));
      }

      // 2. Transformation Pipeline (Railway approach)
      if (!ajaxResult.ok) {
        const error = ajaxResult.error;
        if (controller.signal.aborted) {
          const abortErr = new Error('AbortError');
          abortErr.name = 'AbortError';
          throw abortErr;
        }

        if (options.onError) {
          const hookResult = Result.tryCatch(() => options.onError!(error));
          if (!hookResult.ok) {
            console.error('atomFetch: onError hook threw an error', hookResult.error);
          }
        }
        throw error;
      }

      // Handle transformation (supports both sync and async)
      const data = ajaxResult.value;
      try {
        const transformedResult = options.transform
          ? options.transform(data as unknown, xhr!)
          : (data as T);

        const transformed =
          transformedResult instanceof Promise ? await transformedResult : transformedResult;
        return transformed as T;
      } catch (err) {
        const error = toError(err);
        if (options.onError) {
          Result.tryCatch(() => options.onError!(error));
        }
        throw error;
      }
    } finally {
      controller.signal.removeEventListener('abort', cleanup);
      // Logic: Only clear the reference if this execution is the latest.
      if (active === controller) {
        active = null;
      }
    }
  };

  const atom = computed(execute, {
    defaultValue: options.defaultValue,
    lazy: options.eager === false,
    ...(options.name !== undefined ? { name: options.name } : {}),
  });

  // Constraint: Pending network requests MUST be canceled when the atom is disposed.
  const originalDispose = atom.dispose.bind(atom);
  atom.dispose = () => {
    active?.abort();
    originalDispose();
  };

  return Object.assign(atom, {
    abort: () => active?.abort(),
  }) as ComputedAtom<T> & { abort: () => void };
}

$.extend({ atomFetch });
