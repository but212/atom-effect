import $ from 'jquery';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/index';
import { FetchContext } from '../src/fetch';
import type { FetchError } from '../src/types';

describe('FetchContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute AJAX request with static URL and options', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ name: 'Alice' });

    const context = new FetchContext<{ name: string }>('/api/user', {
      defaultValue: { name: '' },
    });

    const result = await context.execute();
    expect(result).toEqual({ name: 'Alice' });
    expect($.ajax).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/user' }));
  });

  it('should evaluate dynamic URL on each execute', async () => {
    let id = 1;
    vi.spyOn($, 'ajax').mockResolvedValue({ ok: true });
    const context = new FetchContext(() => `/api/user/${id}`, { defaultValue: null });

    await context.execute();
    expect($.ajax).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/user/1' }));

    id = 2;
    await context.execute();
    expect($.ajax).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/user/2' }));
  });

  it('should apply transform option to response', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ items: [1, 2, 3] });

    const context = new FetchContext<number>('/api/items', {
      defaultValue: 0,
      transform: (raw: unknown) => (raw as { items: number[] }).items.length,
    });

    const result = await context.execute();
    expect(result).toBe(3);
  });

  it('should forward method, headers, and ajaxOptions to $.ajax', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ ok: true });

    const context = new FetchContext('/api/resource', {
      defaultValue: null,
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
      ajaxOptions: { dataType: 'text', timeout: 5000 },
    });

    await context.execute();

    expect($.ajax).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/resource',
        method: 'POST',
        headers: { Authorization: 'Bearer token123' },
        dataType: 'text',
        timeout: 5000,
      })
    );
  });

  it('should call onError with the fetch error and rethrow', async () => {
    const networkErr = new Error('Network error');
    vi.spyOn($, 'ajax').mockRejectedValue(networkErr);
    const onError = vi.fn();

    const context = new FetchContext('/api/fail', { defaultValue: null, onError });

    await expect(context.execute()).rejects.toThrow('Network error');
    expect(onError).toHaveBeenCalledWith(networkErr);
  });

  it('should preserve the original error even if onError throws', async () => {
    const networkErr = new Error('Network error');
    vi.spyOn($, 'ajax').mockRejectedValue(networkErr);
    const onError = vi.fn(() => {
      throw new Error('onError threw');
    });

    const context = new FetchContext('/api/fail', { defaultValue: null, onError });

    await expect(context.execute()).rejects.toThrow('Network error');
    expect(onError).toHaveBeenCalled();
  });

  it('should abort xhr when a subsequent execute is called', async () => {
    let rejectXhr!: (e: unknown) => void;
    const abortSpy = vi.fn(() => rejectXhr(new Error('Request aborted')));

    vi.spyOn($, 'ajax').mockReturnValue(
      Object.assign(
        new Promise<unknown>((_, reject) => {
          rejectXhr = reject;
        }),
        { abort: abortSpy }
      ) as unknown as JQuery.jqXHR
    );

    const context = new FetchContext('/api/slow', { defaultValue: null });

    // Start first request
    const promise1 = context.execute();

    // Start second request (should immediately abort the first controller)
    const promise2 = context.execute(); // this cancels promise1 underlying xhr

    expect(abortSpy).toHaveBeenCalledTimes(1);

    // Catch them to prevent unhandled rejection warnings in vitest if they fail
    promise1.catch(() => {});
    promise2.catch(() => {});
  });

  it('transform error throws but does NOT call onError', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ raw: true });
    const onError = vi.fn();
    const transformErr = new Error('bad shape');

    const context = new FetchContext('/api/data', {
      defaultValue: null,
      transform: () => {
        throw transformErr;
      },
      onError,
    });

    await expect(context.execute()).rejects.toThrow('bad shape');
    expect(onError).not.toHaveBeenCalled();
  });

  it('abort before xhr finishes binds onabort correctly', async () => {
    const abortSpy = vi.fn();

    vi.spyOn($, 'ajax').mockReturnValue(
      Object.assign(new Promise<unknown>(() => {}), { abort: abortSpy }) as unknown as JQuery.jqXHR
    );

    let context!: FetchContext<unknown>;
    context = new FetchContext(
      () => {
        // Abort the controller synchronously right AFTER the controller is initialized,
        // but BEFORE $.ajax is called!
        context.abort();
        return '/api/race';
      },
      { defaultValue: null }
    );

    const promise = context.execute();
    promise.catch(() => {}); // prevent unhandled rejections

    // Since abort was called, xhr.abort() MUST have been fired via signal.onabort
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});

describe('$.atomFetch (Reactivity and Atom State)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve data from a static URL into the atom', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ name: 'Alice' });

    const user = $.atomFetch<{ name: string }>('/api/user', {
      defaultValue: { name: '' },
    });

    await $.nextTick();
    await $.nextTick();

    expect(user.value).toEqual({ name: 'Alice' });
  });

  it('should auto-refetch when a reactive URL changes', async () => {
    const id = $.atom(1);
    vi.spyOn($, 'ajax')
      .mockResolvedValueOnce({ id: 1, name: 'Alice' })
      .mockResolvedValueOnce({ id: 2, name: 'Bob' });

    const user = $.atomFetch(() => `/api/users/${id.value}`, {
      defaultValue: { id: 0, name: '' },
    });

    await $.nextTick();
    await $.nextTick();
    expect(user.value).toEqual({ id: 1, name: 'Alice' });

    id.value = 2;
    await $.nextTick();
    void user.value;
    await $.nextTick();
    await $.nextTick();

    expect(user.value).toEqual({ id: 2, name: 'Bob' });
    expect($.ajax).toHaveBeenCalledTimes(2);
  });

  it('should expose isPending state', async () => {
    let resolveAjax!: (v: unknown) => void;
    vi.spyOn($, 'ajax').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAjax = resolve;
        }) as unknown as JQuery.jqXHR
    );

    const data = $.atomFetch('/api/slow', { defaultValue: null });

    await $.nextTick();
    expect(data.isPending).toBe(true);

    resolveAjax({ done: true });
    await $.nextTick();
    await $.nextTick();

    expect(data.isPending).toBe(false);
    expect(data.isResolved).toBe(true);
  });

  it('should set hasError and lastError on fetch failure', async () => {
    vi.spyOn($, 'ajax').mockRejectedValue(new Error('Network error'));

    const data = $.atomFetch('/api/fail', { defaultValue: null });

    await $.nextTick();
    await $.nextTick();

    expect(data.hasError).toBe(true);
    expect(data.lastError?.message).toContain('Network error');
    expect(data.value).toBeNull();
  });

  it('should refetch on invalidate()', async () => {
    vi.spyOn($, 'ajax').mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });

    const data = $.atomFetch('/api/data', { defaultValue: { v: 0 } });

    await $.nextTick();
    await $.nextTick();
    expect(data.value).toEqual({ v: 1 });

    data.invalidate();
    void data.value;
    await $.nextTick();
    await $.nextTick();

    expect(data.value).toEqual({ v: 2 });
    expect($.ajax).toHaveBeenCalledTimes(2);
  });

  it('abort by subsequent fetch should NOT set hasError on the atom', async () => {
    let rejectXhr!: (e: unknown) => void;
    const abortFn = () => rejectXhr(new Error('Request aborted'));

    vi.spyOn($, 'ajax')
      .mockReturnValueOnce(
        Object.assign(
          new Promise<unknown>((_, reject) => {
            rejectXhr = reject;
          }),
          { abort: abortFn }
        ) as unknown as JQuery.jqXHR
      )
      .mockResolvedValueOnce({ ok: true });

    const data = $.atomFetch('/api/slow', { defaultValue: null });

    await $.nextTick();
    expect(data.isPending).toBe(true);

    data.invalidate(); // triggers second fetch execution, aborting the first
    void data.value;
    abortFn(); // simulate rejection callback firing from the aborted xhr

    await $.nextTick();
    await $.nextTick();
    await $.nextTick();

    // The NEVER_SETTLE returned by FetchContext suppresses the error passing
    expect(data.hasError).toBe(false);
    expect(data.value).toEqual({ ok: true });
  });

  it('should allow manual abort via atom.abort() and clear pending state', async () => {
    let rejectXhr!: (e: unknown) => void;
    const abortSpy = vi.fn(() => rejectXhr(new Error('abort')));

    vi.spyOn($, 'ajax').mockReturnValue(
      Object.assign(
        new Promise<unknown>((_, reject) => {
          rejectXhr = reject;
        }),
        { abort: abortSpy }
      ) as unknown as JQuery.jqXHR
    );

    const data = $.atomFetch('/api/manual-abort', { defaultValue: null });
    
    await $.nextTick();
    expect(data.isPending).toBe(true);
    expect(abortSpy).not.toHaveBeenCalled();

    data.abort();
    expect(abortSpy).toHaveBeenCalledTimes(1);

    await $.nextTick();
    await $.nextTick();
    await $.nextTick();

    expect(data.isPending).toBe(false);
    expect(data.hasError).toBe(true);
    expect(data.lastError?.message).toContain('AbortError');
  });

  it('should normalize jqXHR error objects into standard Error', async () => {
    const jqXhrError = { readyState: 4, status: 500, statusText: 'Internal Server Error' };
    vi.spyOn($, 'ajax').mockRejectedValue(jqXhrError);

    const onError = vi.fn();
    const data = $.atomFetch('/api/500', { defaultValue: null, onError });

    await $.nextTick();
    await $.nextTick();

    expect(data.hasError).toBe(true);
    expect(data.lastError).toBeInstanceOf(Error);
    expect(data.lastError?.message).toContain('Network Error: Internal Server Error (500)');

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    const capturedErr = onError.mock.calls[0][0] as FetchError;
    expect(capturedErr.message).toBe('Network Error: Internal Server Error (500)');
    expect(capturedErr.jqXHR).toBe(jqXhrError);
  });

  it('transform error message is surfaced on the atom lastError', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ raw: true });

    const data = $.atomFetch('/api/data', {
      defaultValue: null,
      transform: () => {
        throw new Error('bad shape');
      },
    });

    await $.nextTick();
    await $.nextTick();

    expect(data.lastError?.message).toContain('bad shape');
  });
});
