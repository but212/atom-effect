import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchError, FetchOptions } from '@/types';

// ============================================================================
// atomFetch
// ============================================================================

/**
 * Context for a reactive fetch operation.
 * Manages the lifecycle of a single $.ajax request, including automatic
 * cancellation (via AbortController) and reactive URL/option resolution.
 */
class FetchContext<T> {
  private abortController: AbortController | null = null;
  private readonly staticOptions: JQuery.AjaxSettings;
  private readonly ajaxOptionsFn: (() => JQuery.AjaxSettings) | undefined;
  private readonly getUrl: () => string;

  /**
   * Optimization: If true, the URL is a static string and doesn't need to be
   * re-evaluated within a reactive scope.
   */
  private readonly isStaticUrl: boolean;
  private readonly staticUrl: string | undefined;

  private readonly transformFn: ((val: unknown) => T) | undefined;
  private readonly onErrorFn: ((err: unknown) => void) | undefined;

  constructor(urlOrFn: string | (() => string), options: FetchOptions<T>) {
    const isStatic = typeof urlOrFn === 'string';
    this.isStaticUrl = isStatic;
    if (isStatic) {
      this.staticUrl = urlOrFn as string;
      this.getUrl = () => this.staticUrl!;
    } else {
      this.getUrl = urlOrFn as () => string;
    }

    this.ajaxOptionsFn =
      typeof options.ajaxOptions === 'function' ? options.ajaxOptions : undefined;

    const baseAjax = typeof options.ajaxOptions === 'object' ? options.ajaxOptions : {};
    this.staticOptions = {
      ...baseAjax,
      headers: { ...(baseAjax as JQuery.AjaxSettings)?.headers, ...options.headers },
    };
    if (options.method) {
      this.staticOptions.method = options.method;
    }

    this.transformFn = options.transform;
    this.onErrorFn = options.onError;
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
    } else {
      final = err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
    }

    if (this.onErrorFn) {
      try {
        this.onErrorFn(final);
      } catch {
        // Suppress errors in error callback
      }
    }
    throw final;
  }

  public execute = async (): Promise<T> => {
    this.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const { signal } = controller;

    let onAbort: (() => void) | undefined;

    try {
      const settings = this.prepareSettings();
      const xhr = $.ajax(settings);

      // Link AbortSignal to jqXHR
      onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort);
      if (signal.aborted) xhr.abort();

      const raw = await xhr;
      return this.transformFn ? this.transformFn(raw) : (raw as T);
    } catch (err) {
      if (signal.aborted) throw this.createAbortError();
      return this.handleError(err);
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  };

  private prepareSettings(): JQuery.AjaxSettings {
    const dynamicOptions = this.ajaxOptionsFn?.() ?? {};
    return {
      ...this.staticOptions,
      ...dynamicOptions,
      headers: { ...this.staticOptions.headers, ...dynamicOptions.headers },
      url: this.isStaticUrl ? this.staticUrl : this.getUrl(),
      success: undefined,
      error: undefined,
      complete: undefined,
    };
  }

  private createAbortError(): Error {
    const e = new Error('AbortError');
    e.name = 'AbortError';
    return e;
  }
}

/**
 * Creates a declarative reactive AJAX primitive.
 * Wraps core's async `computed` with jQuery's `$.ajax`.
 *
 * Features:
 * - Auto-Cancellation: Aborts pending requests when dependencies change.
 * - Reactive URL: Re-fetches automatically if `urlOrFn` depends on atoms.
 * - Error Isolation: Network errors are captured in .hasError/.lastError.
 */
$.extend({
  atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T> {
    const ctx = new FetchContext<T>(urlOrFn, options);
    const atomVal = computed(ctx.execute, {
      defaultValue: options.defaultValue,
      lazy: options.eager === false,
    });

    const originalDispose = atomVal.dispose.bind(atomVal);
    atomVal.dispose = () => {
      ctx.abort();
      originalDispose();
    };

    return Object.assign(atomVal, {
      abort: () => ctx.abort(),
    }) as ComputedAtom<T> & { abort: () => void };
  },
});
