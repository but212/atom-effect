import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from '@/types';

/**
 * Logic: Priority Resolution
 * This is a pure data transformation layer that defines the precedence:
 * Direct Options > Dynamic Options > Static Options.
 *
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
    // Constraint: Direct callback options (success/error/complete) are cleared to prevent
    // interference with the automated atom state transitions and concurrency management.
    success: undefined,
    error: undefined,
    complete: undefined,
  };
}

/**
 * Logic: Error Normalization
 * Returns a standard `Error` while preserving the original `jqXHR` context
 * to enable advanced error diagnostics in reactive hooks.
 *
 * @internal
 */
function toError(err: unknown): Error {
  if (err && typeof err === 'object' && 'readyState' in err) {
    const xhr = err as JQuery.jqXHR;
    // Reason: status 0 usually indicates a network timeout or DNS failure where statusText is empty.
    const message = xhr.statusText || (xhr.status === 0 ? 'Network Error' : 'Request Failed');
    const error = new Error(`Network Error: ${message} (${xhr.status})`);
    (error as FetchError).jqXHR = xhr;
    return error;
  }
  return err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
}

/**
 * When to use:
 * - Fetching data that depends on other reactive atoms (auto-refetch on dependency change).
 * - Implementing built-in concurrency management (automatic cancellation of stale requests).
 *
 * Logic: Concurrency Control
 * - Uses `AbortController` and `jqXHR.abort()` to ensures that only the result
 *   of the most recent request is reflected in the atom's state.
 * - Discards older, "out-of-order" responses to prevent UI flickering.
 *
 * @param source - A static URL string or a reactive function that returns a URL.
 * @param options - Configuration for default values, custom headers, and response transformation.
 *
 * @returns A computed atom that automatically manages the async lifecycle.
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
 *
 * @public
 */
function atomFetch<T>(source: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
  const getUrl = typeof source === 'string' ? () => source : source;
  let active: AbortController | null = null;

  const execute = async (): Promise<T> => {
    // Logic: Tracking must happen synchronously before the first 'await'.
    const url = getUrl();
    const settings = toSettings(url, options);

    // Logic: Abort previous request if a new one starts before the old one finishes.
    active?.abort();
    const controller = new AbortController();
    active = controller;

    let xhr: JQuery.jqXHR | undefined;
    const cleanup = () => {
      if (xhr && typeof xhr.abort === 'function') xhr.abort();
    };

    try {
      xhr = $.ajax(settings);

      controller.signal.addEventListener('abort', cleanup);
      if (controller.signal.aborted) cleanup();

      const data = await xhr;
      return options.transform ? options.transform(data, xhr) : (data as T);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        throw error;
      }

      const error = toError(err);

      // Caution: We log but ignore exceptions in user hooks to prevent breaking the atom evaluation chain.
      if (options.onError) {
        try {
          options.onError(error);
        } catch (hookErr) {
          console.error('atomFetch: onError hook threw an error', hookErr);
        }
      }
      throw error;
    } finally {
      controller.signal.removeEventListener('abort', cleanup);
      // Logic: Only clear the global pointer if this specific execution is the most recent one.
      if (active === controller) active = null;
    }
  };

  const atom = computed(execute, {
    defaultValue: options.defaultValue,
    lazy: options.eager === false,
    ...(options.name !== undefined ? { name: options.name } : {}),
  });

  // Constraint: Network requests MUST be canceled when the atom is manually disposed.
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
