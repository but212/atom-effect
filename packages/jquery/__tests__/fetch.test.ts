import $ from 'jquery';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('$.atomFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be registered as a static method on $', () => {
    expect(typeof $.atomFetch).toBe('function');
  });

  it('should resolve data from a static URL', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ name: 'Alice' });

    const user = $.atomFetch<{ name: string }>('/api/user', {
      defaultValue: { name: '' },
    });

    await $.nextTick();
    await $.nextTick();

    expect(user.value).toEqual({ name: 'Alice' });
    expect($.ajax).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/user' }));
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

  it('should set hasError and lastError on real fetch failure', async () => {
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

  it('should apply transform option to response', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ items: [1, 2, 3] });

    const count = $.atomFetch<number>('/api/items', {
      defaultValue: 0,
      transform: (raw: unknown) => (raw as { items: number[] }).items.length,
    });

    await $.nextTick();
    await $.nextTick();

    expect(count.value).toBe(3);
  });

  it('should forward method and headers to $.ajax', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue({ ok: true });

    $.atomFetch('/api/resource', {
      defaultValue: null,
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
    });

    await $.nextTick();

    expect($.ajax).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/resource',
        method: 'POST',
        headers: { Authorization: 'Bearer token123' },
      })
    );
  });

  it('should forward ajaxOptions to $.ajax', async () => {
    vi.spyOn($, 'ajax').mockResolvedValue('raw');

    $.atomFetch('/api/data', {
      defaultValue: '',
      ajaxOptions: { dataType: 'text', timeout: 5000 },
    });

    await $.nextTick();

    expect($.ajax).toHaveBeenCalledWith(
      expect.objectContaining({
        dataType: 'text',
        timeout: 5000,
      })
    );
  });

  // ---------------------------------------------------------------------------
  // Abort / Cancellation
  // ---------------------------------------------------------------------------

  it('abort by subsequent fetch should NOT set hasError', async () => {
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

    data.invalidate();
    void data.value;
    abortFn();

    await $.nextTick();
    await $.nextTick();
    await $.nextTick();

    expect(data.hasError).toBe(false);
    expect(data.value).toEqual({ ok: true });
  });

  it('abort rejection should not bleed into lastError', async () => {
    // Real abort flow: AbortController.abort() sets signal.aborted=true,
    // fires the 'abort' event → xhr.abort() → xhr rejects.
    // The impl detects signal.aborted in the catch block and suppresses the error.
    const OriginalAbortController = globalThis.AbortController;
    let capturedAbortController: AbortController | null = null;
    let rejectXhr!: (e: unknown) => void;

    vi.spyOn(globalThis, 'AbortController').mockImplementationOnce(function (
      this: AbortController
    ) {
      const real = new OriginalAbortController();
      capturedAbortController = real;
      return real;
    } as unknown as typeof AbortController);

    vi.spyOn($, 'ajax').mockReturnValue(
      Object.assign(
        new Promise<unknown>((_, reject) => {
          rejectXhr = reject;
        }),
        { abort: () => rejectXhr(new Error('Request aborted')) }
      ) as unknown as JQuery.jqXHR
    );

    const data = $.atomFetch('/api/slow', { defaultValue: null });
    await $.nextTick();

    capturedAbortController!.abort();
    rejectXhr(new Error('Request aborted'));

    await $.nextTick();
    await $.nextTick();

    expect(data.hasError).toBe(false);
    expect(data.lastError).toBeFalsy();
  });

  it('AbortController.abort() before signal.addEventListener — xhr.abort() must still fire', async () => {
    // Race window: abort() fires between $.ajax() and signal.addEventListener().
    // The impl must check signal.aborted synchronously after addEventListener
    // and call xhr.abort() directly as a fallback.
    //
    // Simulated by intercepting addEventListener, calling abort() inside the mock
    // (before returning), and skipping handler registration.
    const OriginalAbortController = globalThis.AbortController;
    let capturedAbortController: AbortController | null = null;
    const abortSpy = vi.fn();

    vi.spyOn(globalThis, 'AbortController').mockImplementationOnce(function (
      this: AbortController
    ) {
      const real = new OriginalAbortController();
      capturedAbortController = real;
      return real;
    } as unknown as typeof AbortController);

    vi.spyOn(AbortSignal.prototype, 'addEventListener').mockImplementationOnce(function (
      this: AbortSignal,
      _type: string,
      _handler: EventListenerOrEventListenerObject
    ) {
      capturedAbortController!.abort(); // signal.aborted = true in the race window
      // Handler not registered — simulating missed event.
    });

    vi.spyOn($, 'ajax').mockReturnValueOnce(
      Object.assign(new Promise<unknown>(() => {}), { abort: abortSpy }) as unknown as JQuery.jqXHR
    );

    $.atomFetch('/api/race', { defaultValue: null });
    await $.nextTick();

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});
