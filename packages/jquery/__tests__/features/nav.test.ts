import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import type { AtomNav, AtomNavOptions } from '@/types';

/**
 * $.atomNav Specification Tests
 * Focus: Signal over noise, behavioral consistency, and resource safety.
 */
describe('$.atomNav', () => {
  let $target: JQuery;
  let navs: AtomNav[] = [];

  const mockAjax = (data?: unknown, shouldFail = false, headers: Record<string, string> = {}) => {
    return vi.spyOn($, 'ajax').mockImplementation(() => {
      let rejectPromise: (reason: unknown) => void;
      const promise = new Promise((resolve, reject) => {
        rejectPromise = reject;
        if (shouldFail) reject(data);
        else resolve(data);
      });

      return Object.assign(promise, {
        abort: vi.fn(() => rejectPromise({ statusText: 'abort' })),
        getResponseHeader: vi.fn((name: string) => headers[name] || null),
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
    $target.children().atomUnbind();
    $target.remove();
    $('.nav-link').remove();
    $('base').remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  describe('Interception Logic (Routing Policy)', () => {
    it('should correctly filter links based on attributes, protocols, and event state', async () => {
      const ajaxSpy = mockAjax();
      createNav({ target: '#main-content', selector: '.nav-link' });

      const testCases = [
        { label: 'Internal Path', href: '/page1', intercept: true },
        { label: 'New Tab', href: '/page2', target: '_blank', intercept: false },
        { label: 'Download', href: '/file.pdf', download: true, intercept: false },
        { label: 'External Domain', href: 'https://external.com', intercept: false },
        { label: 'Mail/Tel', href: 'mailto:a@b.com', intercept: false },
        { label: 'Data URI', href: 'data:text/html,hi', intercept: false },
        { label: 'Explicit Opt-out', href: '/no-nav', dataNav: 'false', intercept: false },
        { label: 'Right Click', href: '/right', button: 2, intercept: false },
        { label: 'Already Prevented', href: '/prev', preventDefault: true, intercept: false },
      ];

      for (const tc of testCases) {
        ajaxSpy.mockClear();
        const $link = $(`<a href="${tc.href}" class="nav-link"></a>`).appendTo('body');
        if (tc.target) $link.attr('target', tc.target);
        if (tc.download) $link.attr('download', '');
        if (tc.dataNav) $link.attr('data-nav', tc.dataNav);

        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: tc.button ?? 0,
        });

        if (tc.preventDefault) {
          $link[0]?.addEventListener('click', (e) => e.preventDefault(), { once: true });
        }

        let pjaxPrevented = false;
        const checkListener = (e: Event) => {
          pjaxPrevented = e.defaultPrevented;
          e.preventDefault();
        };
        document.addEventListener('click', checkListener, { once: true });
        $link[0]?.dispatchEvent(clickEvent);

        if (tc.intercept) {
          expect(pjaxPrevented, tc.label).toBe(true);
          await vi.waitFor(() => expect(ajaxSpy, tc.label).toHaveBeenCalled());
        } else {
          expect(ajaxSpy, tc.label).not.toHaveBeenCalled();
          if (!tc.preventDefault) expect(pjaxPrevented, tc.label).toBe(false);
        }
        $link.remove();
      }
    });

    it('should respect cancellation hooks', async () => {
      const ajaxSpy = mockAjax('Blocked');
      const nav = createNav({
        target: '#main-content',
        selector: '.nav-link',
        onBeforeLoad: () => false,
      });

      await nav.navigate('/blocked');
      expect(ajaxSpy).not.toHaveBeenCalled();
      expect(nav.currentUrl.value).toBe('/');
    });

    it('should respect base tag context for relative paths', async () => {
      const ajaxSpy = mockAjax('Content');
      const nav = createNav({ target: '#main-content', selector: '.nav-link' });

      const $base = $('<base href="/base-dir/">').appendTo('head');
      const $link = $('<a href="rel" class="nav-link"></a>').appendTo('body');

      $link[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await vi.waitFor(() => expect(nav.currentUrl.value).toContain('/base-dir/rel'));
      expect(ajaxSpy).toHaveBeenCalled();

      $base.remove();
      $link.remove();
    });
  });

  describe('UI & Metadata Reconciliation', () => {
    it('should synchronize content, attributes, and head metadata from response', async () => {
      const $desc = $('<meta name="description" content="old">').appendTo('head');
      const $key = $('<meta name="keywords" content="old">').appendTo('head');

      const serverHtml = `
        <html>
          <head>
            <title>New Title</title>
            <meta name="description" content="new">
            <meta name="keywords" content="new">
          </head>
          <body>
            <div id="main-content" class="new-theme" data-new="true">
              <h1>New Content</h1>
            </div>
            <div id="ignore">Other</div>
          </body>
        </html>
      `;
      mockAjax(serverHtml);

      $target.addClass('old-theme').attr('data-keep', 'alive');
      const nav = createNav({ target: '#main-content', syncTitle: true });

      await nav.navigate('/update');
      await vi.waitFor(() => {
        expect($target.find('h1').text()).toBe('New Content');
        expect(document.title).toBe('New Title');
      });

      // Metadata Sync
      expect($desc.attr('content')).toBe('new');
      expect($key.attr('content')).toBe('new');

      // Attribute Reconciliation
      expect($target.hasClass('new-theme')).toBe(true);
      expect($target.hasClass('old-theme')).toBe(false);
      expect($target.attr('data-new')).toBe('true');
      expect($target.attr('data-keep')).toBeUndefined();

      // Fragment Extraction
      expect($target.html()).not.toContain('id="ignore"');

      $desc.remove();
      $key.remove();
    });

    it('should remove attributes that are not present in the new response', async () => {
      mockAjax('<div id="main-content">New Content</div>');
      $target.attr('data-stale', 'true').addClass('stale-class');

      const nav = createNav({ target: '#main-content' });
      await nav.navigate('/cleanup');

      await vi.waitFor(() => {
        expect($target.attr('data-stale')).toBeUndefined();
        expect($target.hasClass('stale-class')).toBe(false);
      });
    });

    it('should remove meta tags that are missing in the new response', async () => {
      const $desc = $('<meta name="description" content="stale-description">').appendTo('head');
      // Response has no meta tags
      mockAjax('<html><body><div id="main-content">No Meta</div></body></html>');

      const nav = createNav({ target: '#main-content' });
      await nav.navigate('/no-meta');

      try {
        await vi.waitFor(() => {
          expect($('meta[name="description"]').length).toBe(0);
        });
      } finally {
        $desc.remove();
      }
    });

    it('should manage lifecycle hooks and pending state transitions', async () => {
      let resolveAjax!: (v: string) => void;
      mockAjax().mockImplementation(() => {
        const p = new Promise<string>((res) => {
          resolveAjax = res;
        });
        return Object.assign(p, { abort: vi.fn() }) as unknown as JQuery.jqXHR;
      });

      const hooks = { onMount: vi.fn(), onUnmount: vi.fn() };
      const nav = createNav({ target: '#main-content', ...hooks });
      await $.nextTick();
      expect(hooks.onMount).toHaveBeenCalledTimes(1);
      hooks.onMount.mockClear();

      nav.navigate('/next');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      resolveAjax('<div>Updated</div>');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(false));

      expect(hooks.onUnmount).toHaveBeenCalledWith(expect.anything(), '/');
      expect(hooks.onMount).toHaveBeenCalledTimes(1);
    });
  });

  describe('Concurrent Navigation (Race Conditions)', () => {
    it('should prevent hydration races and correctly manage overlapping hooks', async () => {
      let resolveHook!: (v: boolean) => void;
      const hookPromise = new Promise<boolean>((res) => {
        resolveHook = res;
      });

      const mountSpy = vi.fn();
      const nav = createNav({
        target: '#main-content',
        onMount: mountSpy,
        onBeforeLoad: () => hookPromise,
      });

      // 1. Start navigation A (stuck in hook)
      nav.navigate('/a');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      // 2. Start navigation B immediately (aborts A)
      mockAjax('Page B');
      nav.navigate('/b');

      // 3. Resolve A's hook.
      resolveHook(true);

      await vi.waitFor(() => expect($target.text()).toBe('Page B'));
      expect(mountSpy).toHaveBeenCalledTimes(2); // Initial + Page B (Page A skipped)
    });

    it('should ignore navigating to the exact same URL to prevent hook freezes', async () => {
      const beforeSpy = vi.fn();
      const nav = createNav({
        target: '#main-content',
        onBeforeLoad: beforeSpy,
      });

      await $.nextTick(); // Wait for initial mount
      beforeSpy.mockClear();

      // Navigate to the same URL
      await nav.navigate('/');

      // Should completely ignore the navigation and not trigger pending
      expect(beforeSpy).not.toHaveBeenCalled();
      expect(nav.isPending.value).toBe(false);
    });
  });

  describe('Scroll Management', () => {
    it('should coordinate hash transitions, top-scrolling, and popstate restoration', async () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const nav = createNav({ target: '#main-content' });

      // Case 1: Hash navigation (Complex chars)
      mockAjax('<div id="a.b:c">Target</div>');
      await nav.navigate('/p#a.b:c');
      await vi.waitFor(() => expect(scrollIntoViewSpy).toHaveBeenCalled());

      // Case 2: Removing hash (Should scroll to top)
      scrollSpy.mockClear();
      await nav.navigate('/p');
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));

      // Case 3: Same-page "#"
      scrollSpy.mockClear();
      await nav.navigate('#');
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));

      // Case 4: Popstate (Should NOT force scroll, allow native restoration)
      scrollSpy.mockClear();
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(scrollSpy).not.toHaveBeenCalled();

      scrollSpy.mockRestore();
    });
  });

  describe('Advanced Routing & Resource Safety', () => {
    it('should handle server-side redirects via X-PJAX-URL efficiently and trigger hooks with correct final URL', async () => {
      const mountSpy = vi.fn();
      const unmountSpy = vi.fn();
      mockAjax('Redirected', false, { 'X-PJAX-URL': '/final' });

      const nav = createNav({
        target: '#main-content',
        onMount: mountSpy,
        onUnmount: unmountSpy,
      });

      await $.nextTick();
      mountSpy.mockClear();

      await nav.navigate('/start');
      await vi.waitFor(() => {
        expect(nav.currentUrl.value).toBe('/final');
        expect(window.location.pathname).toBe('/final');
      });

      // Verification of the fix: onMount should be called with '/final'
      // and onUnmount should be called with the original mounting URL '/'
      expect(unmountSpy).toHaveBeenCalledWith(expect.anything(), '/');
      expect(mountSpy).toHaveBeenCalledWith(expect.anything(), '/final');

      // Verification of state consistency: _renderedState should NOT be overwritten by /start
      // Use internal-ish check or verify next navigation
      mountSpy.mockClear();
      mockAjax('Next Page');
      await nav.navigate('/next');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/next'));
      expect(unmountSpy).toHaveBeenCalledWith(expect.anything(), '/final');
    });

    it('should handle server-resolved redirect chains without re-fetching', async () => {
      // In real HTTP, 3xx redirect chains are followed automatically by the browser/jQuery.
      // The X-PJAX-URL header reports the FINAL destination after all redirects.
      // The client should apply this final URL without triggering additional fetches.
      const ajaxSpy = vi.spyOn($, 'ajax').mockImplementation(() => {
        const promise = Promise.resolve('Final Content');
        return Object.assign(promise, {
          abort: vi.fn(),
          getResponseHeader: vi.fn((name: string) =>
            name === 'X-PJAX-URL' ? '/final-destination' : null
          ),
          getAllResponseHeaders: vi.fn(),
          setRequestHeader: vi.fn(),
          statusCode: vi.fn(),
          promise: () => promise,
        }) as unknown as JQuery.jqXHR;
      });

      const nav = createNav({ target: '#main-content' });
      await nav.navigate('/original');

      await vi.waitFor(() => {
        expect(nav.currentUrl.value).toBe('/final-destination');
        expect(window.location.pathname).toBe('/final-destination');
      });

      // Only 1 AJAX call should happen; the redirect chain is resolved server-side
      expect(ajaxSpy).toHaveBeenCalledTimes(1);
      expect($target.text()).toBe('Final Content');
    });

    it('should fallback to hard navigation on critical failures', async () => {
      const assignMock = vi.fn();
      const mockWin = {
        location: { ...window.location, assign: assignMock },
        history: window.history,
        document: window.document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      mockAjax({ status: 500 }, true);
      const nav = createNav({
        target: '#main-content',
        window: mockWin as unknown as Window & typeof globalThis,
      });

      await nav.navigate('/fail');
      await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/fail'));
    });

    it('should clean up internal resources and DOM markers on destroy', async () => {
      const abortSpy = vi.fn();
      mockAjax().mockImplementation(() => {
        const p = new Promise<string>(() => {});
        return Object.assign(p, { abort: abortSpy }) as unknown as JQuery.jqXHR;
      });

      const nav = createNav({ target: '#main-content' });
      const currentUrlAtom = nav.currentUrl;
      vi.spyOn(currentUrlAtom, 'dispose');

      expect($target.attr('data-atom-nav-target')).toBe('true');

      // 1. Pending request should be aborted
      nav.navigate('/pending');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      // 2. Destroy should cleanup everything
      nav.destroy();
      expect(abortSpy).toHaveBeenCalled();
      expect(currentUrlAtom.dispose).toHaveBeenCalled();
      expect($target.attr('data-atom-nav-target')).toBeUndefined();
    });
  });
});
