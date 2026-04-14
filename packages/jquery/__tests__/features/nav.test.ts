import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import type { AtomNav, AtomNavOptions } from '@/types';

/**
 * $.atomNav Specification Tests
 * Focus: Link interception, reactive state, and DOM reconciliation.
 */
describe('$.atomNav', () => {
  let $target: JQuery;
  let navs: AtomNav[] = [];

  // Centralized AJAX mock with proper abort/jqXHR emulation.
  const mockAjax = (data?: unknown, shouldFail = false) => {
    return vi.spyOn($, 'ajax').mockImplementation(() => {
      let rejectPromise: (reason: unknown) => void;
      const promise = new Promise((resolve, reject) => {
        rejectPromise = reject;
        if (shouldFail) reject(data);
        else resolve(data);
      });

      return Object.assign(promise, {
        abort: vi.fn(() => rejectPromise({ statusText: 'abort' })),
        getResponseHeader: vi.fn(),
        getAllResponseHeaders: vi.fn(),
        setRequestHeader: vi.fn(),
        statusCode: vi.fn(),
        promise: () => promise,
      }) as unknown as JQuery.jqXHR;
    });
  };

  beforeEach(() => {
    $target = $('<div id="main-content">Original</div>').appendTo('body');
    window.history.replaceState(null, '', '/');
    navs = [];
    mockAjax('Initial');
  });

  afterEach(() => {
    navs.forEach((nav) => nav.destroy());
    $target.remove();
    $('.nav-link').remove();
    vi.restoreAllMocks();
  });

  const createNav = (options: AtomNavOptions) => {
    const nav = $.atomNav(options);
    navs.push(nav);
    return nav;
  };

  it('should initialize with reactive state atoms', () => {
    const nav = createNav({ target: '#main-content' });
    expect($.isAtom(nav.currentUrl)).toBe(true);
    expect($.isAtom(nav.isPending)).toBe(true);
    expect($.isAtom(nav.hasError)).toBe(true);
  });

  /**
   * Domain: Link Interception & Routing Policy
   */
  describe('Navigation Policy', () => {
    it('should correctly filter links to intercept or ignore', async () => {
      mockAjax('Base Content');
      createNav({ target: '#main-content', selector: '.nav-link' });

      // Ensure the initial navigation (to '/') is completed before testing link clicks
      await vi.waitFor(() => expect($target.html()).toBe('Base Content'));

      mockAjax('Content');
      const testCases = [
        { label: 'Internal Path', href: '/page1', intercept: true },
        { label: 'New Tab', href: '/page2', target: '_blank', intercept: false },
        { label: 'Download link', href: '/file.pdf', download: true, intercept: false },
        { label: 'External Domain', href: 'https://external.com', intercept: false },
        { label: 'Mail/Tel', href: 'mailto:a@b.com', intercept: false },
      ];

      for (const tc of testCases) {
        const $link = $(`<a href="${tc.href}" class="nav-link"></a>`).appendTo('body');
        if (tc.target) $link.attr('target', tc.target);
        if (tc.download) $link.attr('download', '');

        const event = $.Event('click');
        $link.trigger(event);

        if (tc.intercept) {
          expect(event.isDefaultPrevented(), tc.label).toBe(true);
          await vi.waitFor(() => expect($target.html()).toBe('Content'));
        } else {
          expect(event.isDefaultPrevented(), tc.label).toBe(false);
          expect(window.location.pathname, tc.label).not.toBe(tc.href);
        }
        $link.remove();
      }
    });

    it('should respect onBeforeLoad hook for cancellation', async () => {
      const ajaxSpy = mockAjax('Blocked');
      const nav = createNav({ target: '#main-content', onBeforeLoad: () => false });

      nav.navigate('/blocked');
      await $.nextTick();
      expect(ajaxSpy).toHaveBeenCalledTimes(1); // Only initial fetch
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  /**
   * Domain: Reactive Lifecycle & UI Management
   */
  describe('Reconciliation Lifecycle', () => {
    it('should manage pending/error states and lifecycle hooks', async () => {
      let resolveAjax!: (v: string) => void;
      vi.spyOn($, 'ajax').mockImplementation(() => {
        const p = new Promise<string>((res) => {
          resolveAjax = res;
        });
        return Object.assign(p, { abort: vi.fn() }) as unknown as JQuery.jqXHR;
      });

      const hooks = { onMount: vi.fn(), onUnmount: vi.fn() };
      const nav = createNav({ target: '#main-content', ...hooks });

      // Pending state
      nav.navigate('/loading');
      await $.nextTick();
      expect(nav.isPending.value).toBe(true);

      // Successfully resolved
      resolveAjax('<div>New Content</div>');
      await vi.waitFor(() => expect($target.html()).toBe('<div>New Content</div>'));
      expect(nav.isPending.value).toBe(false);
      expect(hooks.onUnmount).toHaveBeenCalled();
      expect(hooks.onMount).toHaveBeenCalled();
    });

    it('should update document title from response fragments', async () => {
      mockAjax('<div><title>Dynamic Title</title>Body</div>');
      const nav = createNav({ target: '#main-content', syncTitle: true });

      nav.navigate('/title-change');
      await vi.waitFor(() => expect(document.title).toBe('Dynamic Title'));
    });

    it('should coordinate memory safety (atomUnbind) and smart scrolling', async () => {
      const unbindSpy = vi.fn();
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const originalUnbind = $.fn.atomUnbind;
      $.fn.atomUnbind = function () {
        unbindSpy();
        return originalUnbind.apply(this);
      };

      try {
        mockAjax('<div id="section-a">A</div>');
        const nav = createNav({ target: '#main-content' });

        // Scenario: Deep link scroll
        nav.navigate('/page#section-a');
        await vi.waitFor(() => {
          expect(unbindSpy).toHaveBeenCalled();
          expect(scrollIntoViewSpy).toHaveBeenCalled();
        });

        // Scenario: Top scroll fallback
        mockAjax('Non-hash content');
        nav.navigate('/top');
        await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));
      } finally {
        $.fn.atomUnbind = originalUnbind;
        scrollSpy.mockRestore();
      }
    });
  });
});
