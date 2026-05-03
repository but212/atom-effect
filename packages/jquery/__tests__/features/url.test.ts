import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('$.atomUrl - Relational Reactivity', () => {
  // --- Helpers ---

  /** Helper to assert multiple URL components at once */
  const expectUrlState = (expected: {
    path?: string;
    query?: Record<string, string>;
    hash?: string;
    search?: string;
    type?: string;
  }) => {
    if (expected.path !== undefined) expect($.atomUrl.path.value).toBe(expected.path);
    if (expected.query !== undefined) expect($.atomUrl.query.value).toEqual(expected.query);
    if (expected.hash !== undefined) expect($.atomUrl.hash.value).toBe(expected.hash);
    if (expected.search !== undefined) expect($.atomUrl.search.value).toBe(expected.search);
    if (expected.type !== undefined) expect($.atomUrl.type.value).toBe(expected.type);
  };

  beforeEach(() => {
    // Reset browser environment to a clean state
    window.history.replaceState(null, '', '/');
    $.atomUrl.base.value = '';
    $.atomUrl.reset();
  });

  afterEach(() => {
    $.atomUrl.dispose();
    vi.restoreAllMocks();
  });

  describe('Reactive State Initialization', () => {
    it('should initialize correctly from window.location', () => {
      expectUrlState({
        path: '/',
        query: {},
        hash: '',
        type: 'init',
      });
    });

    it('should provide a full URL atom', () => {
      expect($.atomUrl.url.value).toBe(window.location.href);
    });
  });

  describe('Bidirectional Property Sync', () => {
    it('syncs path atom with window.location.pathname', async () => {
      $.atomUrl.path.value = '/test-path';
      await $.nextTick();
      expect(window.location.pathname).toBe('/test-path');
    });

    it('syncs query object and search string bidirectionally', async () => {
      // 1. Setting query object updates search string
      $.atomUrl.query.value = { a: '1', b: '2' };
      await $.nextTick();
      expect(window.location.search).toBe('?a=1&b=2');
      expect($.atomUrl.search.value).toBe('?a=1&b=2');

      // 2. Setting search string updates query object
      $.atomUrl.search.value = '?x=10';
      await $.nextTick();
      expect($.atomUrl.query.value).toEqual({ x: '10' });
    });

    it('syncs hash fragment', async () => {
      $.atomUrl.hash.value = '#section-1';
      await $.nextTick();
      expect(window.location.hash).toBe('#section-1');

      // Browser initiated change
      window.location.hash = 'manual';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await $.nextTick();
      expect($.atomUrl.hash.value).toBe('#manual');
    });
  });

  describe('History API Integration (Actor)', () => {
    it('performs pushState and updates navigation type', async () => {
      const state = { some: 'data' };
      $.atomUrl.push('/page-1', state);

      expectUrlState({ path: '/page-1', type: 'push' });
      expect($.atomUrl.state.value).toEqual(state);
    });

    it('performs replaceState and updates navigation type', async () => {
      $.atomUrl.replace('/page-2');
      expectUrlState({ path: '/page-2', type: 'replace' });
    });

    it('uses replaceState for pure state updates via atom', async () => {
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      $.atomUrl.state.value = { updated: true };
      await $.nextTick();

      expect(replaceSpy).toHaveBeenCalled();
      expect($.atomUrl.state.value).toEqual({ updated: true });
    });

    it('reacts to popstate events (Browser Navigation)', async () => {
      $.atomUrl.push('/step-1');
      $.atomUrl.push('/step-2');

      // Simulate browser back button
      window.history.replaceState({ back: true }, '', '/back-path');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { back: true } }));

      await $.nextTick();
      expectUrlState({ path: '/back-path', type: 'pop' });
      expect($.atomUrl.state.value).toEqual({ back: true });
    });
  });

  describe('Batching & Performance', () => {
    it('consolidates multiple part updates into a single history entry', async () => {
      const pushSpy = vi.spyOn(window.history, 'pushState');

      $.batch(() => {
        $.atomUrl.path.value = '/batched';
        $.atomUrl.query.value = { q: '1' };
        $.atomUrl.hash.value = 'end';
      });

      await $.nextTick();
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(window.location.href).toContain('/batched?q=1#end');
    });

    it('prevents redundant updates if values are unchanged (Optimization)', async () => {
      let updateCount = 0;
      const stop = $.effect(() => {
        $.atomUrl.path.value;
        updateCount++;
        return undefined;
      });

      // Update to same value
      $.atomUrl.path.value = '/';
      await $.nextTick();

      expect(updateCount).toBe(1); // Only initial execution
      stop.dispose();
    });
  });

  describe('Path Resolution & Scoping', () => {
    it('resolves relative paths correctly in push()', async () => {
      window.history.replaceState(null, '', '/category/item');
      $.atomUrl.reset();

      $.atomUrl.push('detail'); // Relative to /category/item
      await $.nextTick();
      expect(window.location.pathname).toBe('/category/detail');
    });

    it('respects base path and exposes relative path via atom', async () => {
      $.atomUrl.base.value = '/admin';

      // Navigate to /admin/users
      $.atomUrl.path.value = '/users';
      await $.nextTick();

      expect(window.location.pathname).toBe('/admin/users');
      expect($.atomUrl.path.value).toBe('/users'); // Relational view
    });

    it('ignores base path for external URLs and avoids pushState security errors', () => {
      const pushSpy = vi.spyOn(window.history, 'pushState');
      // Logic: Mocking location properties is tricky in some environments,
      // so we focus on ensuring pushState is NOT called for external origins.
      $.atomUrl.base.value = '/app';
      $.atomUrl.push('https://example.com');

      expect(pushSpy).not.toHaveBeenCalled();
    });
  });

  describe('Stability & Resilience', () => {
    it('revives atoms automatically after accidental disposal', () => {
      const pathAtom = $.atomUrl.path;
      pathAtom.dispose();

      // Should still work due to resilient proxy logic
      $.atomUrl.push('/revived');
      expect($.atomUrl.path.value).toBe('/revived');
    });

    it('cleans up listeners properly on dispose()', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      $.atomUrl.dispose(); // Ensure clean state
      $.atomUrl.reset(); // Trigger setup
      expect(addSpy).toHaveBeenCalled();

      $.atomUrl.dispose(); // Trigger cleanup
      expect(removeSpy).toHaveBeenCalled();
    });

    it('handles initialization gracefully', () => {
      expect(() => $.atomUrl.update('init')).not.toThrow();
    });
  });
});
