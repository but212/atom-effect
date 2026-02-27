import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from './types';

// ============================================================================
// atomFetch
// ============================================================================

export class FetchContext<T> {
  private abortController: AbortController | null = null;
  private readonly baseOptions: JQuery.AjaxSettings;
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

    this.baseOptions = Object.assign({}, options.ajaxOptions);
    if (options.method !== undefined) this.baseOptions.method = options.method;
    if (options.headers !== undefined) this.baseOptions.headers = options.headers;

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

    // Create a fresh options object for each request to prevent jQuery from mutating the shared object
    const reqOptions: JQuery.AjaxSettings = { ...this.baseOptions };
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

      let finalErr = err as Error;
      if (err && typeof (err as JQuery.jqXHR).readyState !== 'undefined') {
        const jXhr = err as JQuery.jqXHR;
        // Construct pure Error, but attach the original jqXHR for advanced use-cases
        finalErr = new Error(`Network Error: ${jXhr.statusText || 'Unknown'} (${jXhr.status})`);
        (finalErr as FetchError).jqXHR = jXhr;
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

    const transform = this.transformFn;
    return transform ? transform(raw) : (raw as T);
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
