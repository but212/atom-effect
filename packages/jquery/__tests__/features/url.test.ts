import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('$.atomUrl - Reactive URL Management', () => {
  // --- Test Utilities ---

  /** Helper to access private _resolve for logic testing */
  const resolve = (url: string) =>
    ($.atomUrl as unknown as { _resolve: (url: string) => string })._resolve(url);

  /** Helper to assert multiple URL parts in one go */
  const expectUrl = (parts: {
    path?: string;
    search?: string;
    hash?: string;
    params?: Record<string, string>;
    url?: string;
  }) => {
    if (parts.path !== undefined) expect($.atomUrl.path.value).toBe(parts.path);
    if (parts.search !== undefined) expect($.atomUrl.search.value).toBe(parts.search);
    if (parts.hash !== undefined) expect($.atomUrl.hash.value).toBe(parts.hash);
    if (parts.params !== undefined) expect($.atomUrl.params.value).toEqual(parts.params);
    if (parts.url !== undefined) expect($.atomUrl.url.value).toBe(parts.url);
  };

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    $.atomUrl.basePath = '';
    $.atomUrl.reset();
    $.debug.enabled = false;
  });

  afterEach(() => {
    $.atomUrl.dispose();
    vi.restoreAllMocks();
  });

  describe('Core State & Reactivity', () => {
    it('initializes from window.location correctly', () => {
      expectUrl({
        url: window.location.href,
        path: '/',
      });
      expect($.atomUrl.type.value).toBe('init');
    });

    it('tracks history state changes', async () => {
      const state = { user: { id: 1 } };
      $.atomUrl.push('/dashboard', state);

      expect($.atomUrl.state.value).toEqual(state);
      expectUrl({ path: '/dashboard' });
      expect($.atomUrl.type.value).toBe('push');
    });

    it('optimizes state updates using shallow equality', async () => {
      $.atomUrl.push('/a', { val: 1 });
      await $.nextTick();

      let updates = 0;
      const stop = $.effect(() => {
        $.atomUrl.state.value;
        updates++;
        return undefined;
      });

      $.atomUrl.state.value = { val: 1 }; // New object, same content
      await $.nextTick();

      expect(updates).toBe(1);
      stop.dispose();
    });

    it('uses replaceState for pure state updates', async () => {
      const pushSpy = vi.spyOn(window.history, 'pushState');
      const replaceSpy = vi.spyOn(window.history, 'replaceState');

      $.atomUrl.state.value = { changed: true };
      await $.nextTick();

      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).toHaveBeenCalled();
    });
  });

  describe('Navigation Synchronization', () => {
    it('syncs with browser popstate events', async () => {
      $.atomUrl.push('/step-1');
      $.atomUrl.push('/step-2');

      const backState = { from: 'manual' };
      window.history.replaceState(backState, '', '/back');
      window.dispatchEvent(new PopStateEvent('popstate', { state: backState }));

      await $.nextTick();
      expectUrl({ path: '/back', params: {} });
      expect($.atomUrl.state.value).toEqual(backState);
      expect($.atomUrl.type.value).toBe('pop');
    });

    it('syncs with hashchange events', async () => {
      window.location.hash = 'target';
      window.dispatchEvent(new HashChangeEvent('hashchange'));

      await $.nextTick();
      expectUrl({ hash: '#target' });
      expect($.atomUrl.type.value).toBe('hash');
    });
  });

  describe('URL Part Manipulation (DX)', () => {
    it('navigates when updating path directly', async () => {
      $.atomUrl.path.value = '/settings';
      await $.nextTick();
      expect(window.location.pathname).toBe('/settings');
    });

    it('handles search parameters as an object', async () => {
      $.atomUrl.params.value = { q: 'search', p: '1' };
      await $.nextTick();

      expect(window.location.search).toContain('q=search');
      expectUrl({ params: { q: 'search', p: '1' } });
    });

    it('clears parameters when set to null/undefined', async () => {
      $.atomUrl.params.value = { a: '1', b: '2' };
      await $.nextTick();

      $.atomUrl.params.value = { a: '1', b: undefined as unknown as string };
      await $.nextTick();

      expect(new URLSearchParams(window.location.search).has('b')).toBe(false);
    });

    it('preserves other URL parts during single property updates', async () => {
      $.atomUrl.push('/path?q=1#top');
      $.atomUrl.path.value = '/new';
      await $.nextTick();

      expectUrl({ path: '/new', search: '?q=1', hash: '#top' });
    });

    it('batches multiple property updates into one history entry', async () => {
      const spy = vi.spyOn(window.history, 'pushState');

      $.batch(() => {
        $.atomUrl.path.value = '/batched';
        $.atomUrl.hash.value = 'end';
      });

      await $.nextTick();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(window.location.href).toContain('/batched#end');
    });
  });

  describe('Path Resolution & BasePath', () => {
    it('normalizes basePath automatically', () => {
      $.atomUrl.basePath = '/app/';
      window.history.replaceState(null, '', '/app/home');
      $.atomUrl.reset();
      expectUrl({ path: '/home' });

      $.atomUrl.basePath = 'admin';
      window.history.replaceState(null, '', '/admin/dashboard');
      $.atomUrl.reset();
      expectUrl({ path: '/dashboard' });
    });

    it('resolves relative paths correctly', async () => {
      window.history.replaceState(null, '', '/section/page');
      $.atomUrl.reset();

      $.atomUrl.push('next');
      await $.nextTick();
      expect(window.location.pathname).toBe('/section/next');
    });

    it('resolves absolute paths relative to basePath', async () => {
      $.atomUrl.basePath = '/sub';
      $.atomUrl.push('/home');
      await $.nextTick();
      expect(window.location.pathname).toBe('/sub/home');
    });

    it('respects external protocols and protocol-relative URLs', () => {
      $.atomUrl.basePath = '/app';
      expect(resolve('//external.com')).toBe('//external.com');
      expect(resolve('mailto:hi@test.com')).toBe('mailto:hi@test.com');
    });

    it('picks up basePath changes immediately (no race condition)', async () => {
      $.atomUrl.basePath = '/dynamic';
      $.atomUrl.push('/page');
      expect(window.location.pathname).toBe('/dynamic/page');
    });
  });

  describe('Stability & Lifecycle', () => {
    it('prevents infinite loops from reactive navigation', async () => {
      let count = 0;
      vi.spyOn(window.history, 'pushState').mockImplementation(() => {
        count++;
      });

      const stop = $.effect(() => {
        if ($.atomUrl.path.value === '/loop') $.atomUrl.push('/target');
        return undefined;
      });

      $.atomUrl.path.value = '/loop';
      await $.nextTick();

      expect(count).toBeLessThan(10);
      stop.dispose();
    });

    it('handles malformed URLs gracefully', async () => {
      $.atomUrl.search.value = '???invalid';
      await $.nextTick();
      expect($.atomUrl.params.value).toBeDefined();
    });

    it('manages resource cleanup in dispose()', async () => {
      let count = 0;
      $.effect(() => {
        $.atomUrl.path.value;
        count++;
        return undefined;
      });

      $.atomUrl.dispose();

      // Manually trigger internal state (simulating browser event after dispose)
      const internal = $.atomUrl as unknown as {
        _snapshot: { value: unknown; peek: () => { url: string } };
      };
      internal._snapshot.value = {
        ...internal._snapshot.peek(),
        url: 'http://localhost/disconnected',
      };

      expect(count).toBe(1); // Should not have increased
    });

    it('allows reviving singleton parts after accidental disposal', () => {
      $.atomUrl.path.dispose();

      $.atomUrl.push('/revived');
      expectUrl({ path: '/revived' }); // Should still work due to resilient logic
    });

    it('restores listeners correctly on reset', () => {
      $.atomUrl.dispose();
      const spy = vi.spyOn(window, 'addEventListener');
      $.atomUrl.reset();
      expect(spy).toHaveBeenCalled();
    });
  });
});
