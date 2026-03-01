import $ from 'jquery';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/index';
import type { FetchError } from '../src/types';

// ---------------------------------------------------------------------------
// Integration Suite: atomFetch
// ---------------------------------------------------------------------------
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

    // The AbortError thrown by the superseded request is ignored by the `computed` core, so the atom does not enter an error state.
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

  describe('Architecture Flaws', () => {
    it('1. onError SHOULD be called if transform throws an error', async () => {
      vi.spyOn($, 'ajax').mockResolvedValue({ raw: true });
      const onError = vi.fn();

      const _data = $.atomFetch('/api/data', {
        defaultValue: null,
        onError,
        transform: () => {
          throw new Error('transform parse error');
        },
      });

      await $.nextTick();
      await $.nextTick();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain('transform parse error');
    });

    it('2. Static Payload Trap: ajaxOptions should reflect updated atom values upon refetch', async () => {
      const searchUrl = $.atom('/api/search');
      let capturedOptions: JQuery.AjaxSettings | undefined;

      vi.spyOn($, 'ajax').mockImplementation((opts) => {
        capturedOptions = opts;
        return Promise.resolve({ ok: true }) as unknown as JQuery.jqXHR;
      });

      const queryAtom = $.atom('apple');

      const data = $.atomFetch(() => searchUrl.value, {
        defaultValue: null,
        method: 'POST',
        ajaxOptions: () => ({
          data: { q: queryAtom.value },
        }),
      });

      await $.nextTick();
      await $.nextTick();
      expect(capturedOptions?.data).toEqual({ q: 'apple' });
      expect(capturedOptions?.method).toBe('POST'); // method must survive ajaxOptionsFn

      queryAtom.value = 'banana';
      searchUrl.value = '/api/search?page=2';

      await $.nextTick();
      void data.value;
      await $.nextTick();
      await $.nextTick();

      expect(capturedOptions?.data).toEqual({ q: 'banana' });
      expect(capturedOptions?.method).toBe('POST'); // must still be present after refetch
    });

    it('4. Async Tracking Loss: atoms read after await in transform are NOT tracked (known limitation)', async () => {
      vi.spyOn($, 'ajax').mockResolvedValue({ price: 100 });
      const currencyRate = $.atom(1.2);

      const priceEur = $.atomFetch('/api/price', {
        defaultValue: 0,
        transform: (raw: unknown) => (raw as { price: number }).price * currencyRate.value,
      });

      await $.nextTick();
      await $.nextTick();

      expect(priceEur.value).toBe(120);

      // Changing currencyRate does NOT trigger re-fetch because transform runs
      // after `await xhr` — outside the synchronous tracking window of computed.
      // This is a known limitation of async computed.
      currencyRate.value = 1.5;

      await $.nextTick();
      void priceEur.value;
      await $.nextTick();
      await $.nextTick();

      // Value stays at 120 (NOT 150) because currencyRate was never tracked.
      expect(priceEur.value).toBe(120);
    });
  });
});
