import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from '@/types';

// ============================================================================
// atomFetch
// ============================================================================

class FetchContext<T> {
  private abortController: AbortController | null = null;
  private readonly staticOptions: JQuery.AjaxSettings;
  private readonly ajaxOptionsFn: (() => JQuery.AjaxSettings) | undefined;
  private readonly getUrl: () => string;
  private readonly transformFn: ((val: unknown) => T) | undefined;
  private readonly onErrorFn: ((err: unknown) => void) | undefined;

  constructor(urlOrFn: string | (() => string), options: FetchOptions<T>) {
    this.getUrl = typeof urlOrFn === 'string' ? () => urlOrFn : urlOrFn;
    this.ajaxOptionsFn =
      typeof options.ajaxOptions === 'function' ? options.ajaxOptions : undefined;
    this.staticOptions = {
      ...(typeof options.ajaxOptions === 'object' ? options.ajaxOptions : {}),
      method: options.method,
      headers: { ...(options.ajaxOptions as JQuery.AjaxSettings)?.headers, ...options.headers },
    };
    this.transformFn = options.transform;
    this.onErrorFn = options.onError;
    this.execute = this.execute.bind(this);
  }

  public abort(): void {
    this.abortController?.abort();
  }

  private handleError(err: unknown): never {
    let final: Error;
    if (err && typeof (err as JQuery.jqXHR).readyState !== 'undefined') {
      const x = err as JQuery.jqXHR;
      final = new Error(`Network Error: ${x.statusText || 'Unknown'} (${x.status})`);
      (final as FetchError).jqXHR = x;
    } else final = err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));

    if (this.onErrorFn)
      try {
        this.onErrorFn(final);
      } catch {}
    throw final;
  }

  public async execute(): Promise<T> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const req = $.extend(
      true,
      { success: undefined, error: undefined, complete: undefined },
      this.staticOptions,
      this.ajaxOptionsFn?.(),
      { url: this.getUrl() }
    );
    const xhr = $.ajax(req);

    signal.onabort = () => xhr.abort();
    if (signal.aborted) xhr.abort();

    try {
      const raw = await xhr;
      return this.transformFn ? this.transformFn(raw) : (raw as T);
    } catch (err) {
      if (signal.aborted) {
        const e = new Error('AbortError');
        e.name = 'AbortError';
        throw e;
      }
      return this.handleError(err);
    } finally {
      signal.onabort = null;
      if (this.abortController?.signal === signal) this.abortController = null;
    }
  }
}

$.extend({
  atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
    const ctx = new FetchContext<T>(urlOrFn, options);
    const atomVal = computed(ctx.execute, {
      defaultValue: options.defaultValue,
      lazy: options.eager === false,
    });
    return Object.assign(atomVal, {
      abort: () => ctx.abort(),
    }) as ComputedAtom<T> & { abort: () => void };
  },
});
