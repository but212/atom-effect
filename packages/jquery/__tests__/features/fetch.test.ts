import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $, { type FetchError } from '@/index';
import { createMockJqXHR } from '../utils/test-helpers';

/**
 * Integration Suite: $.atomFetch
 * Validates reactive state transitions, concurrency management, and error lifecycle.
 */
describe('$.atomFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Functionality', () => {
    it('should resolve data from a static URL into the atom', async () => {
      vi.spyOn($, 'ajax').mockResolvedValue({ name: 'Alice' });

      const user = $.atomFetch<{ name: string }>('/api/user', {
        defaultValue: { name: '' },
      });

      void user.value;
      await vi.waitFor(() => expect(user.value).toEqual({ name: 'Alice' }));
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
      expect(user.value).toEqual({ id: 1, name: 'Alice' });

      id.value = 2;
      void user.value;

      await vi.waitFor(() => expect(user.value).toEqual({ id: 2, name: 'Bob' }));
      expect($.ajax).toHaveBeenCalledTimes(2);
    });

    it('should expose accurate isPending/isResolved state', async () => {
      let resolveAjax!: (v: unknown) => void;
      vi.spyOn($, 'ajax').mockImplementation(
        () =>
          createMockJqXHR(
            new Promise((resolve) => {
              resolveAjax = resolve;
            })
          )
      );

      const data = $.atomFetch('/api/slow', { defaultValue: null });

      await $.nextTick();
      expect(data.isPending).toBe(true);

      resolveAjax({ done: true });
      await $.nextTick();

      expect(data.isPending).toBe(false);
      expect(data.isResolved).toBe(true);
    });

    it('should refetch on invalidate()', async () => {
      vi.spyOn($, 'ajax').mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });

      const data = $.atomFetch('/api/data', { defaultValue: { v: 0 } });

      await $.nextTick();
      expect(data.value).toEqual({ v: 1 });

      data.invalidate();
      void data.value;
      await $.nextTick();

      expect(data.value).toEqual({ v: 2 });
      expect($.ajax).toHaveBeenCalledTimes(2);
    });
  });

  describe('Option Prioritization', () => {
    let capturedOptions: JQuery.AjaxSettings | undefined;

    beforeEach(() => {
      capturedOptions = undefined;
      vi.spyOn($, 'ajax').mockImplementation((opts) => {
        capturedOptions = opts;
        return createMockJqXHR(Promise.resolve({ ok: true }));
      });
    });

    it('should prioritize explicit options.method over dynamic/base options', async () => {
      $.atomFetch('/api/test', {
        defaultValue: null,
        method: 'PUT',
        ajaxOptions: () => ({ method: 'POST' }),
      });
      await $.nextTick();
      expect(capturedOptions?.method).toBe('PUT');
    });

    it('should prioritize explicit options.headers over dynamic options (Regression Fix)', async () => {
      $.atomFetch('/api/test', {
        defaultValue: null,
        headers: { 'X-Test': 'User' },
        ajaxOptions: () => ({ headers: { 'X-Test': 'Dynamic' } }),
      });

      await $.nextTick();
      expect(capturedOptions?.headers?.['X-Test']).toBe('User');
    });

    it('should allow ajaxOptions to set values if direct options are missing', async () => {
      $.atomFetch('/api/test', {
        defaultValue: null,
        ajaxOptions: { method: 'POST', timeout: 5000 },
      });
      await $.nextTick();
      expect(capturedOptions?.method).toBe('POST');
      expect(capturedOptions?.timeout).toBe(5000);
    });
  });

  describe('Error Handling & Normalization', () => {
    it('should normalize jqXHR objects into standard Error with metadata', async () => {
      const jqXhrError = { readyState: 4, status: 500, statusText: 'Internal Server Error' };
      vi.spyOn($, 'ajax').mockRejectedValue(jqXhrError);

      const onError = vi.fn();
      const data = $.atomFetch('/api/500', { defaultValue: null, onError });

      await $.nextTick();

      expect(data.hasError).toBe(true);
      expect(data.lastError?.message).toContain('Network Error: Internal Server Error (500)');

      // Error is wrapped by ComputedAtom core logic, extracting it from .cause
      const originalError = (data.lastError as { cause: FetchError }).cause;
      expect(originalError).toBeDefined();
      expect(originalError.jqXHR).toBe(jqXhrError);
      expect(onError).toHaveBeenCalledWith(originalError);
    });

    it('should provide a descriptive message even if statusText is missing', async () => {
      const jqXhrMock = { readyState: 4, status: 0, statusText: '' };
      vi.spyOn($, 'ajax').mockRejectedValue(jqXhrMock);

      const data = $.atomFetch('/api/timeout', { defaultValue: null });
      await $.nextTick();

      expect(data.hasError).toBe(true);
      expect(data.lastError?.message).not.toContain('Unknown');
      expect(data.lastError?.message).toMatch(/Network Error: .* \(0\)/);
    });

    it('should handle synchronous errors during request initialization', async () => {
      vi.spyOn($, 'ajax').mockImplementation(() => {
        throw new Error('Immediate failure');
      });
      const onError = vi.fn();
      const data = $.atomFetch('/api/sync-fail', { defaultValue: null, onError });

      await $.nextTick();

      expect(data.hasError).toBe(true);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0].message).toContain('Immediate failure');
    });

    it('should capture errors thrown within the transform function', async () => {
      vi.spyOn($, 'ajax').mockResolvedValue({ raw: true });
      const data = $.atomFetch('/api/data', {
        defaultValue: null,
        transform: () => {
          throw new Error('bad shape');
        },
      });

      await $.nextTick();
      expect(data.lastError?.message).toContain('bad shape');
    });

    it('should handle asynchronous transform functions', async () => {
      vi.spyOn($, 'ajax').mockResolvedValue({ id: 1 });

      const data = $.atomFetch<{ id: number; name: string }>('/api/async', {
        defaultValue: { id: 0, name: 'unknown' },
        transform: async (raw: unknown) => {
          await new Promise((r) => setTimeout(r, 10));
          return { ...(raw as { id: number }), name: 'Async Alice' };
        },
      });

      await vi.waitFor(() => expect(data.value).toEqual({ id: 1, name: 'Async Alice' }));
    });

    it('should log (but not swallow) exceptions thrown by the onError hook (Regression Fix)', async () => {
      vi.spyOn($, 'ajax').mockRejectedValue(new Error('Network fail'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn().mockImplementation(() => {
        throw new Error('User Hook Error');
      });

      $.atomFetch('/api/fail', { defaultValue: null, onError });

      await $.nextTick();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('atomFetch: onError hook threw an error'),
        expect.any(Error)
      );
    });
  });

  describe('Lifecycle Management & Concurrency', () => {
    it('should abort previous requests when a new fetch is triggered', async () => {
      let rejectXhr!: (e: unknown) => void;
      const abortFn = vi.fn(() => rejectXhr(new Error('Request aborted')));

      vi.spyOn($, 'ajax')
        .mockReturnValueOnce(
          createMockJqXHR(
            new Promise<unknown>((_, reject) => {
              rejectXhr = reject;
            }),
            { abort: abortFn }
          )
        )
        .mockResolvedValueOnce({ ok: true });

      const data = $.atomFetch('/api/slow', { defaultValue: null });

      await $.nextTick();
      data.invalidate();
      void data.value;
      abortFn();

      await $.nextTick();
      expect(abortFn).toHaveBeenCalled();
      expect(data.hasError).toBe(false); // superseded request error is ignored
      expect(data.value).toEqual({ ok: true });
    });

    it('should allow manual abort via atom.abort()', async () => {
      const abortSpy = vi.fn();
      vi.spyOn($, 'ajax').mockReturnValue(
        createMockJqXHR(new Promise(() => {}), { abort: abortSpy })
      );

      const data = $.atomFetch('/api/manual', { defaultValue: null });
      await $.nextTick();

      data.abort();
      expect(abortSpy).toHaveBeenCalled();
    });

    it('should abort pending requests when the atom is disposed', async () => {
      const abortSpy = vi.fn();
      vi.spyOn($, 'ajax').mockReturnValue(
        createMockJqXHR(new Promise(() => {}), { abort: abortSpy })
      );

      const data = $.atomFetch('/api/dispose', { defaultValue: null });
      await $.nextTick();

      data.dispose();
      expect(abortSpy).toHaveBeenCalled();
    });

    it('Async Tracking Loss: atoms read after await in transform are NOT tracked (Known Limitation)', async () => {
      vi.spyOn($, 'ajax').mockResolvedValue({ price: 100 });
      const currencyRate = $.atom(1.2);

      const priceEur = $.atomFetch('/api/price', {
        defaultValue: 0,
        transform: (raw: unknown) => (raw as { price: number }).price * currencyRate.value,
      });

      await $.nextTick();
      expect(priceEur.value).toBe(120);

      currencyRate.value = 1.5;
      void priceEur.value;
      await $.nextTick();

      // Tracking does not work across await boundaries in transform.
      expect(priceEur.value).toBe(120);
    });

    it('should handle synchronous abort immediately after starting fetch', async () => {
      const abortSpy = vi.fn();
      vi.spyOn($, 'ajax').mockReturnValue(
        createMockJqXHR(new Promise(() => {}), { abort: abortSpy })
      );

      const data = $.atomFetch('/api/sync-abort', { defaultValue: null });
      // Access value to trigger execution, then abort immediately
      void data.value;
      data.abort();

      await $.nextTick();
      expect(abortSpy).toHaveBeenCalled();
    });

    it('should abort session immediately when aborted during URL resolution', async () => {
      const abortSpy = vi.fn();
      vi.spyOn($, 'ajax').mockImplementation((_settings) => {
        return createMockJqXHR(new Promise(() => {}), { abort: abortSpy });
      });

      const data = $.atomFetch(
        () => {
          data.abort(); // Abort during getUrl() evaluation
          return '/api/sync-abort-during-geturl';
        },
        { defaultValue: null, eager: false }
      );

      void data.value;
      await $.nextTick();
      expect(abortSpy).toHaveBeenCalled();
    });
  });
});
