/**
 * @module AtomFetch
 *
 * Responsibility:
 * Runs AJAX requests in an effect and exposes their state through a pure
 * computed projection.
 *
 * Design Intent:
 * Provides a declarative interface for data fetching that automatically handles
 * dependency tracking, concurrency control, and lifecycle-bound cancellation.
 */

import {
  type AsyncStateType,
  type ComputedAtom,
  ComputedError,
  computed,
  atom as createAtom,
  effect,
  untracked,
} from '@but212/atom-effect';
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
  const ajaxOptionsObject = typeof ajaxOptions === 'function' ? ajaxOptions() : ajaxOptions || {};

  return {
    ...ajaxOptionsObject,
    url,
    method: method || ajaxOptionsObject.method,
    headers: { ...ajaxOptionsObject.headers, ...headers },
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
function toError(rawError: unknown): Error {
  if (rawError && typeof rawError === 'object' && 'readyState' in rawError) {
    const xmlHttpRequest = rawError as JQuery.jqXHR;
    // Reason: A status of 0 typically indicates a network timeout or DNS
    // failure where statusText might be empty.
    const message =
      xmlHttpRequest.statusText ||
      (xmlHttpRequest.status === 0 ? 'Network Error' : 'Request Failed');
    const error = new Error(`Network Error: ${message} (${xmlHttpRequest.status})`, {
      cause: rawError,
    });
    (error as FetchError).jqXHR = xmlHttpRequest;
    return error;
  }
  return rawError instanceof Error
    ? rawError
    : new Error(String(rawError ?? 'Unknown error'), { cause: rawError });
}

interface FetchSession {
  xmlHttpRequest: JQuery.jqXHR | null;
  isAborted: boolean;
}

interface FetchSnapshot<T> {
  state: AsyncStateType;
  value: T;
  error: Error | null;
}

interface FetchRequestInputs {
  settings: JQuery.AjaxSettings;
}

const EMPTY_ERRORS: readonly Error[] = Object.freeze([]);

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
function atomFetch<T>(
  source: string | (() => string),
  options: FetchOptions<T>
): ComputedAtom<T> & { abort: () => void } {
  const getUrl = typeof source === 'string' ? () => source : source;
  let activeSession: FetchSession | null = null;
  let effectHandle: ReturnType<typeof effect> | null = null;
  let projectedAtom: ComputedAtom<T> | null = null;
  let lastRequestedInputs: FetchRequestInputs | undefined;
  let lastSuccessfulValue: T | undefined;
  let disposed = false;
  let refreshOnRead = false;
  let currentSnapshot: FetchSnapshot<T> = {
    state: 'idle',
    value: options.defaultValue,
    error: null,
  };
  const resource = createAtom(currentSnapshot, {
    ...(options.name === undefined ? {} : { name: `${options.name}:resource` }),
  });

  const abortSession = (session: FetchSession | null) => {
    if (session) {
      session.isAborted = true;
      if (session.xmlHttpRequest && typeof session.xmlHttpRequest.abort === 'function') {
        session.xmlHttpRequest.abort();
      }
    }
  };

  const setSnapshot = (snapshot: FetchSnapshot<T>) => {
    currentSnapshot = snapshot;
    if (projectedAtom) projectedAtom._error = snapshot.error;
    if (!disposed) resource.value = snapshot;
  };

  const failSession = (session: FetchSession, ajaxError: unknown) => {
    if (activeSession !== session) return;

    let error: Error;
    if (session.isAborted) {
      error = new Error('AbortError');
      error.name = 'AbortError';
    } else {
      error = toError(ajaxError);
      if (options.onError) {
        try {
          options.onError(error);
        } catch (onErrorHookError) {
          console.error('atomFetch: onError hook threw an error', onErrorHookError);
        }
      }
    }

    setSnapshot({
      state: 'rejected',
      value: options.defaultValue,
      error: new ComputedError(error.message, { cause: error }),
    });
    activeSession = null;
  };

  const resolveSession = async (session: FetchSession, xmlHttpRequest: JQuery.jqXHR) => {
    try {
      const responseData = await xmlHttpRequest;
      const transformedResult = options.transform
        ? options.transform(responseData as unknown, xmlHttpRequest)
        : (responseData as T);
      const value =
        transformedResult instanceof Promise ? await transformedResult : transformedResult;

      if (activeSession === session && !session.isAborted) {
        lastSuccessfulValue = value;
        setSnapshot({ state: 'resolved', value, error: null });
      }
    } catch (ajaxError) {
      failSession(session, ajaxError);
    } finally {
      if (activeSession === session) activeSession = null;
    }
  };

  const requestInputs = computed<FetchRequestInputs>(
    () => {
      const url = getUrl();
      return { settings: toSettings(url, options) };
    },
    {
      ...(options.name === undefined ? {} : { name: `${options.name}:inputs` }),
    }
  );

  const execute = () => {
    // Why: Abort the previous request if a new execution cycle starts to prevent race conditions.
    abortSession(activeSession);
    const session: FetchSession = { xmlHttpRequest: null, isAborted: false };
    activeSession = session;
    setSnapshot({ state: 'pending', value: options.defaultValue, error: null });

    try {
      // Constraint: Dependency tracking must occur synchronously before the first 'await'.
      const inputs = requestInputs.value;
      lastRequestedInputs = inputs;
      const xmlHttpRequest = $.ajax(inputs.settings);
      session.xmlHttpRequest = xmlHttpRequest;

      if (session.isAborted) {
        abortSession(session);
      }
      void resolveSession(session, xmlHttpRequest);
    } catch (ajaxError) {
      failSession(session, ajaxError);
    }
  };

  const projection = computed(() => resource.value.value, {
    defaultValue: options.defaultValue,
    ...(options.name === undefined ? {} : { name: options.name }),
  });
  projectedAtom = projection;

  const start = () => {
    if (disposed) return;
    if (!effectHandle) {
      // The initial run satisfies any invalidation requested before a lazy read.
      refreshOnRead = false;
      effectHandle = effect(execute, {
        ...(options.name === undefined ? {} : { name: `${options.name}:request` }),
      });
      return;
    }
    if (refreshOnRead) {
      refreshOnRead = false;
      effectHandle.run();
      return;
    }
    try {
      const currentInputs = untracked(() => requestInputs.value);
      if (currentInputs !== lastRequestedInputs) effectHandle.run();
    } catch {
      if (currentSnapshot.state !== 'rejected') effectHandle.run();
    }
  };

  if (options.eager !== false) start();

  const valueDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(projection),
    'value'
  );
  const readProjectedValue = valueDescriptor?.get?.bind(projection);
  if (!readProjectedValue)
    throw new Error('atomFetch could not initialize its computed projection');
  const projectedPrototype = Object.getPrototypeOf(projection);
  const readProjectedDisposed = Object.getOwnPropertyDescriptor(
    projectedPrototype,
    'isDisposed'
  )?.get?.bind(projection);
  const disposeProjection = projection.dispose.bind(projection);
  const invalidateProjection = projection.invalidate.bind(projection);

  Object.defineProperties(projection, {
    value: {
      configurable: true,
      get: () => {
        start();
        const value = readProjectedValue();
        projection._error = currentSnapshot.error;
        return value;
      },
    },
    peek: {
      configurable: true,
      value: () => lastSuccessfulValue as T,
    },
    state: {
      configurable: true,
      get: () => (disposed ? currentSnapshot.state : resource.value.state),
    },
    isPending: {
      configurable: true,
      get: () =>
        disposed ? currentSnapshot.state === 'pending' : resource.value.state === 'pending',
    },
    isResolved: {
      configurable: true,
      get: () =>
        disposed ? currentSnapshot.state === 'resolved' : resource.value.state === 'resolved',
    },
    isRejected: {
      configurable: true,
      get: () =>
        disposed ? currentSnapshot.state === 'rejected' : resource.value.state === 'rejected',
    },
    hasError: {
      configurable: true,
      get: () => (disposed ? currentSnapshot.error !== null : resource.value.error !== null),
    },
    isValid: {
      configurable: true,
      get: () => (disposed ? currentSnapshot.error === null : resource.value.error === null),
    },
    lastError: {
      configurable: true,
      get: () => (disposed ? currentSnapshot.error : resource.value.error),
    },
    errors: {
      configurable: true,
      get: () => {
        const error = disposed ? currentSnapshot.error : resource.value.error;
        return error ? Object.freeze([error]) : EMPTY_ERRORS;
      },
    },
    isDisposed: {
      configurable: true,
      get: () => disposed || readProjectedDisposed?.() === true,
    },
    subscribe: {
      configurable: true,
      value: (listener: Parameters<ComputedAtom<T>['subscribe']>[0]) => {
        if (typeof listener === 'function') {
          return resource.subscribe((next, previous) => {
            if (!next) return;
            listener(
              next.state === 'pending' ? undefined : next.value,
              previous?.state === 'pending' ? undefined : previous?.value
            );
          });
        }
        return resource.subscribe({
          execute: () => listener.execute(),
          ...(listener.isComputed === undefined ? {} : { isComputed: listener.isComputed }),
        });
      },
    },
    subscriberCount: {
      configurable: true,
      value: () => resource.subscriberCount(),
    },
    invalidate: {
      configurable: true,
      value: () => {
        refreshOnRead = true;
        invalidateProjection();
      },
    },
    dispose: {
      configurable: true,
      value: () => {
        if (disposed) return;
        disposed = true;
        abortSession(activeSession);
        activeSession = null;
        effectHandle?.dispose();
        disposeProjection();
        requestInputs.dispose();
        resource.dispose();
        currentSnapshot = { state: 'idle', value: options.defaultValue, error: null };
        projection._error = null;
      },
    },
  });

  // Constraint: Pending network requests MUST be canceled when the atom is disposed.
  const abort = () => abortSession(activeSession);

  return Object.assign(projection, { abort }) as ComputedAtom<T> & { abort: () => void };
}

$.extend({ atomFetch });
