/**
 * @module AtomFetch
 *
 * Responsibility:
 * Orchestrates reactive network requests by synchronizing computed atoms with
 * asynchronous jQuery AJAX operations.
 *
 * Design Intent:
 * Provides a declarative interface for data fetching that automatically handles
 * dependency tracking, concurrency control, and lifecycle-bound cancellation.
 */

import { type ComputedAtom, computed } from '@but212/atom-effect';
import { Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import type { FetchError, FetchOptions } from '@/types';

/**
 * Logic: Priority Resolution
 * Precedence is established as follows: Direct Options > Dynamic Options > Static Options.
 *
 * Constraint: Callback Isolation
 * Direct callback options (`success`, `error`, `complete`) are explicitly
 * cleared to prevent interference with the automated state transitions
 * and concurrency management.
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
    success: undefined,
    error: undefined,
    complete: undefined,
  };
}

/**
 * Logic: Error Normalization
 * Standardizes non-uniform jQuery AJAX errors into native Error objects
 * while preserving the original XHR context for diagnostics.
 *
 * @internal
 */
function toError(err: unknown): Error {
  if (err && typeof err === 'object' && 'readyState' in err) {
    const xhr = err as JQuery.jqXHR;
    // Reason: A status of 0 typically indicates a network timeout or DNS
    // failure where statusText might be empty.
    const message = xhr.statusText || (xhr.status === 0 ? 'Network Error' : 'Request Failed');
    const error = new Error(`Network Error: ${message} (${xhr.status})`, { cause: err });
    (error as FetchError).jqXHR = xhr;
    return error;
  }
  return err instanceof Error ? err : new Error(String(err ?? 'Unknown error'), { cause: err });
}

/**
 * Creates a computed atom that synchronizes with a network request.
 *
 * When to use:
 * - To fetch data automatically when reactive dependencies (e.g., atoms) change.
 * - To enforce "latest-only" concurrency where stale requests are cancelled.
 * - To unify error handling and data transformation for remote resources.
 *
 * @example
 * ```ts
 * const userId = atom(1);
 * const userProfile = $.atomFetch(() => `/api/users/${userId.get()}`, {
 *   transform: (data) => data.profile
 * });
 * ```
 *
 * Logic: Concurrency Control
 * Uses AbortController and jqXHR.abort() to enforce a "latest-only"
 * resolution strategy. Older requests are canceled to prevent stale data
 * from overwriting newer updates.
 */
function atomFetch<T>(source: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
  const getUrl = typeof source === 'string' ? () => source : source;
  let active: AbortController | null = null;

  const execute = async (): Promise<T> => {
    // Why: Abort the previous request if a new execution cycle starts to prevent race conditions.
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
      /**
       * Reason: Manual Error Handling
       * Uses manual try-catch blocks to ensure compatibility with jqXHR's
       * unique 'await' behavior and capture synchronous initialization errors
       * for the `onError` hook.
       */
      let ajaxResult: Result<unknown, Error>;
      try {
        // Constraint: Dependency tracking must occur synchronously before the first 'await'.
        const url = getUrl();
        const settings = toSettings(url, options);
        xhr = $.ajax(settings);
        const data = await xhr;
        ajaxResult = Result.ok(data);
      } catch (err) {
        ajaxResult = Result.err(toError(err));
      }

      // Logic: Railway Transformation Pipeline
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
