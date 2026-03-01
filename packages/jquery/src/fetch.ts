import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from './types';

// ============================================================================
// atomFetch
// ============================================================================

class FetchContext<T> {
  private abortController: AbortController | null = null;
  private readonly ajaxOptionsFn?: () => JQuery.AjaxSettings;
  private readonly staticOptions: JQuery.AjaxSettings;
  private readonly isStaticUrl: boolean;
  private readonly staticUrl?: string;
  private readonly getUrl?: () => string;
  private readonly transformFn: ((val: unknown) => T) | undefined;
  private readonly onErrorFn: ((err: unknown) => void) | undefined;

  constructor(urlOrFn: string | (() => string), options: FetchOptions<T>) {
    this.isStaticUrl = typeof urlOrFn === 'string';
    if (this.isStaticUrl) {
      this.staticUrl = urlOrFn as string;
    } else {
      this.getUrl = urlOrFn as () => string;
    }

    if (typeof options.ajaxOptions === 'function') {
      this.ajaxOptionsFn = options.ajaxOptions;
      this.staticOptions = {};
    } else {
      this.staticOptions = { ...options.ajaxOptions };
    }
    if (options.method !== undefined) this.staticOptions.method = options.method;
    if (options.headers !== undefined)
      this.staticOptions.headers = { ...this.staticOptions.headers, ...options.headers };

    this.transformFn = options.transform;
    this.onErrorFn = options.onError;

    this.execute = this.execute.bind(this);
  }

  public abort(): void {
    this.abortController?.abort();
  }

  public async execute(): Promise<T> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Evaluate ajaxOptionsFn each time to track reactive atoms inside it.
    // Merge order: staticOptions (method, headers, …) as base, then ajaxOptionsFn()
    // on top so dynamic values can override statics but statics are never lost.
    const dynamicOpts = this.ajaxOptionsFn ? this.ajaxOptionsFn() : {};
    // Deep clone to prevent jQuery from mutating shared objects
    const reqOptions: JQuery.AjaxSettings = $.extend(true, {}, this.staticOptions, dynamicOpts);

    // Block jQuery legacy callbacks to prevent fake errors on internal Abort
    reqOptions.success = undefined;
    reqOptions.error = undefined;
    reqOptions.complete = undefined;

    reqOptions.url = this.isStaticUrl ? this.staticUrl : this.getUrl!();

    const xhr = $.ajax(reqOptions);

    signal.onabort = () => xhr.abort();
    if (signal.aborted) xhr.abort();

    let raw: unknown;
    try {
      raw = await xhr;
    } catch (err) {
      if (signal.aborted) {
        // Delegate abort handling gracefully to the core computed tracking system.
        // - Superseded aborts: core ignores them (since _promiseId bumps up).
        // - Manual aborts: core catches them, updating state (hasError/isPending).
        const abortErr = new Error('AbortError');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      let finalErr: Error;
      // Normalize jqXHR and other potential rejection values into standard Error instances.
      if (err && typeof (err as JQuery.jqXHR).readyState !== 'undefined') {
        const jXhr = err as JQuery.jqXHR;
        finalErr = new Error(`Network Error: ${jXhr.statusText || 'Unknown'} (${jXhr.status})`);
        (finalErr as FetchError).jqXHR = jXhr;
      } else {
        finalErr = err instanceof Error ? err : new Error(String(err ?? 'Unknown network error'));
      }

      const onError = this.onErrorFn;
      if (onError) {
        try {
          // Call without `this` binding to preserve purity of user callback
          onError(finalErr);
        } catch {
          // Ignore errors thrown by onError itself.
        }
      }
      throw finalErr;
    } finally {
      signal.onabort = null;
      if (this.abortController?.signal === signal) this.abortController = null;
    }

    // Transform runs synchronously after await, so atoms read here won't be tracked.
    // This is an inherent limitation of async computed.
    // Users who need reactive transform should use a separate synchronous computed.
    const transform = this.transformFn;
    if (transform) {
      try {
        return transform(raw);
      } catch (err) {
        // Surface transform errors via onError callback
        const onError = this.onErrorFn;
        if (onError) {
          try {
            onError(err);
          } catch {
            // Ignore errors thrown by onError itself.
          }
        }
        throw err;
      }
    }
    return raw as T;
  }
}

$.extend({
  atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
    const context = new FetchContext<T>(urlOrFn, options);
    const isLazy = !(options.eager ?? true);

    const atomVal = computed(context.execute, {
      defaultValue: options.defaultValue,
      lazy: isLazy,
    });

    return Object.assign(atomVal, {
      abort: () => context.abort(),
    }) as ComputedAtom<T> & { abort: () => void };
  },
});
