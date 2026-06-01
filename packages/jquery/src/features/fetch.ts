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
  const optObj = typeof ajaxOptions === 'function' ? ajaxOptions() : ajaxOptions || {};

  return {
    ...optObj,
    url,
    method: method || optObj.method,
    headers: { ...optObj.headers, ...headers },
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

interface FetchSession {
  xhr: JQuery.jqXHR | null;
  aborted: boolean;
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
 * Uses a FetchSession data structure to abort the previous request and discard
 * its result, enforcing a "latest-only" resolution strategy.
 */
function atomFetch<T>(source: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
  const getUrl = typeof source === 'string' ? () => source : source;
  let activeSession: FetchSession | null = null;

  const abortSession = (session: FetchSession | null) => {
    if (session) {
      session.aborted = true;
      if (session.xhr && typeof session.xhr.abort === 'function') {
        session.xhr.abort();
      }
    }
  };

  const execute = async (): Promise<T> => {
    // Why: Abort the previous request if a new execution cycle starts to prevent race conditions.
    abortSession(activeSession);
    const session: FetchSession = { xhr: null, aborted: false };
    activeSession = session;

    try {
      // Constraint: Dependency tracking must occur synchronously before the first 'await'.
      const url = getUrl();
      const settings = toSettings(url, options);
      const xhr = $.ajax(settings);
      session.xhr = xhr;

      if (session.aborted) {
        abortSession(session);
      }

      const data = await xhr;

      const transformedResult = options.transform
        ? options.transform(data as unknown, xhr)
        : (data as T);

      return transformedResult instanceof Promise ? await transformedResult : transformedResult;
    } catch (err) {
      if (session.aborted) {
        const abortErr = new Error('AbortError');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const error = toError(err);
      if (options.onError) {
        try {
          options.onError(error);
        } catch (hookErr) {
          console.error('atomFetch: onError hook threw an error', hookErr);
        }
      }
      throw error;
    } finally {
      if (activeSession === session) {
        activeSession = null;
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
    abortSession(activeSession);
    originalDispose();
  };

  return Object.assign(atom, {
    abort: () => abortSession(activeSession),
  }) as ComputedAtom<T> & { abort: () => void };
}

$.extend({ atomFetch });
