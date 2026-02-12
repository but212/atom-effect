import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('$.atomFetch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

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

    // Wait for async resolution
    await $.nextTick();
    await $.nextTick();

    expect(user.value).toEqual({ name: 'Alice' });
    expect($.ajax).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/user' })
    );
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

    // Change the atom → URL changes → auto-refetch
    id.value = 2;
    await $.nextTick(); // atom notification propagates
    void user.value; // trigger re-evaluation (effects do this automatically in real usage)
    await $.nextTick();
    await $.nextTick();

    expect(user.value).toEqual({ id: 2, name: 'Bob' });
    expect($.ajax).toHaveBeenCalledTimes(2);
  });

  it('should expose isPending state', async () => {
    let resolveAjax!: (v: unknown) => void;
    vi.spyOn($, 'ajax').mockImplementation(
      () => new Promise((resolve) => { resolveAjax = resolve; }) as unknown as JQuery.jqXHR
    );

    const data = $.atomFetch('/api/slow', { defaultValue: null });

    // Before resolution: should be pending
    await $.nextTick();
    expect(data.isPending).toBe(true);

    // Resolve
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
    // Should fall back to defaultValue
    expect(data.value).toBeNull();
  });

  it('should refetch on invalidate()', async () => {
    vi.spyOn($, 'ajax')
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValueOnce({ v: 2 });

    const data = $.atomFetch('/api/data', { defaultValue: { v: 0 } });

    await $.nextTick();
    await $.nextTick();
    expect(data.value).toEqual({ v: 1 });

    data.invalidate();
    void data.value; // trigger re-evaluation
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
});
