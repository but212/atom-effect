import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $, { type AtomNav, type AtomNavOptions } from '@/index';

/**
 * $.atomNav Specification Tests
 * Focus: Correctness of link interception, state synchronization, race condition management, and resource safety.
 */
describe('$.atomNav', () => {
  let $target: JQuery;
  let navs: AtomNav[] = [];

  // --- Helpers ---

  /** Mock factory for jQuery AJAX to simulate various server responses and behaviors. */
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

  const createNav = (options: AtomNavOptions) => {
    const nav = $.atomNav(options);
    navs.push(nav);
    return nav;
  };

  // --- Setup & Teardown ---

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

  // --- Specifications ---

  describe('Core Initialization', () => {
    it('should initialize with reactive state atoms and correct initial values', () => {
      const nav = createNav({ target: '#main-content' });
      expect($.isAtom(nav.currentUrl)).toBe(true);
      expect($.isAtom(nav.isPending)).toBe(true);
      expect($.isAtom(nav.hasError)).toBe(true);
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  describe('Routing Policy (Link Interception)', () => {
    it('should correctly filter links based on origin, protocols, and attributes', async () => {
      const ajaxSpy = mockAjax();
      createNav({ target: '#main-content', selector: '.nav-link' });

      const scenarios = [
        { label: 'Same-origin path', href: '/page1', expectedIntercept: true },
        { label: 'New tab target', href: '/page2', target: '_blank', expectedIntercept: false },
        {
          label: 'Download attribute',
          href: '/file.pdf',
          download: true,
          expectedIntercept: false,
        },
        { label: 'External domain', href: 'https://external.com', expectedIntercept: false },
        { label: 'Protocol: mailto', href: 'mailto:a@b.com', expectedIntercept: false },
        { label: 'Protocol: data', href: 'data:text/html,hi', expectedIntercept: false },
        {
          label: 'Explicit data-nav="false"',
          href: '/no-nav',
          dataNav: 'false',
          expectedIntercept: false,
        },
        { label: 'Right-click event', href: '/right', button: 2, expectedIntercept: false },
        {
          label: 'Explicit event prevention',
          href: '/prev',
          preventDefault: true,
          expectedIntercept: false,
        },
      ];

      for (const scenario of scenarios) {
        ajaxSpy.mockClear();
        const $link = $(`<a href="${scenario.href}" class="nav-link"></a>`).appendTo('body');
        if (scenario.target) $link.attr('target', scenario.target);
        if (scenario.download) $link.attr('download', '');
        if (scenario.dataNav) $link.attr('data-nav', scenario.dataNav);

        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: scenario.button ?? 0,
        });

        if (scenario.preventDefault) {
          $link[0]?.addEventListener('click', (e) => e.preventDefault(), { once: true });
        }

        let defaultPrevented = false;
        const interceptChecker = (e: Event) => {
          defaultPrevented = e.defaultPrevented;
          e.preventDefault(); // Stop actual navigation
        };
        document.addEventListener('click', interceptChecker, { once: true });
        $link[0]?.dispatchEvent(clickEvent);

        if (scenario.expectedIntercept) {
          expect(defaultPrevented, scenario.label).toBe(true);
          await vi.waitFor(() => expect(ajaxSpy, scenario.label).toHaveBeenCalled());
        } else {
          expect(ajaxSpy, scenario.label).not.toHaveBeenCalled();
          if (!scenario.preventDefault) expect(defaultPrevented, scenario.label).toBe(false);
        }
        $link.remove();
      }
    });

    it('should respect base tag context when resolving relative paths', async () => {
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

    it('should allow navigation cancellation via onBeforeLoad hook', async () => {
      const ajaxSpy = mockAjax('Blocked');
      const nav = createNav({
        target: '#main-content',
        onBeforeLoad: () => false,
      });

      await nav.navigate('/blocked');
      expect(ajaxSpy).not.toHaveBeenCalled();
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  describe('State Synchronization (DOM & Metadata)', () => {
    it('should synchronize content, attributes, and <head> metadata from response', async () => {
      const $desc = $('<meta name="description" content="stale">').appendTo('head');
      const $key = $('<meta name="keywords" content="stale">').appendTo('head');

      const serverResponse = `
        <html>
          <head>
            <title>New Title</title>
            <meta name="description" content="fresh">
            <meta name="keywords" content="fresh">
          </head>
          <body>
            <div id="main-content" class="active-theme" data-new="true">
              <h1>Target Content</h1>
            </div>
            <div id="ignore-me">Extraneous</div>
          </body>
        </html>
      `;
      mockAjax(serverResponse);

      $target.addClass('old-theme').attr('data-stale', 'true');
      const nav = createNav({ target: '#main-content', syncTitle: true });

      await nav.navigate('/update');
      await vi.waitFor(() => {
        expect($target.find('h1').text()).toBe('Target Content');
        expect(document.title).toBe('New Title');
      });

      // Metadata check
      expect($('meta[name="description"]').attr('content')).toBe('fresh');
      expect($('meta[name="keywords"]').attr('content')).toBe('fresh');

      // Attribute reconciliation
      expect($target.hasClass('active-theme')).toBe(true);
      expect($target.hasClass('old-theme')).toBe(false);
      expect($target.attr('data-new')).toBe('true');
      expect($target.attr('data-stale')).toBeUndefined();

      // Scoped extraction
      expect($target.html()).not.toContain('ignore-me');

      $desc.remove();
      $key.remove();
    });

    it('should cleanup stale attributes and meta tags missing in the new response', async () => {
      const $desc = $('<meta name="description" content="stale">').appendTo('head');
      mockAjax('<div id="main-content">Minimal</div>');

      $target.attr('data-temp', 'val');
      const nav = createNav({ target: '#main-content' });

      await nav.navigate('/minimal');
      await vi.waitFor(() => {
        expect($target.attr('data-temp')).toBeUndefined();
        expect($('meta[name="description"]').length).toBe(0);
      });

      $desc.remove();
    });
  });

  describe('Lifecycle & Concurrency', () => {
    it('should manage mounting hooks and pending transition states', async () => {
      let resolveAjax!: (v: string) => void;
      mockAjax().mockImplementation(() => {
        const p = new Promise<string>((res) => {
          resolveAjax = res;
        });
        return Object.assign(p, { abort: vi.fn() }) as unknown as JQuery.jqXHR;
      });

      const lifecycle = { onMount: vi.fn(), onUnmount: vi.fn() };
      const nav = createNav({ target: '#main-content', ...lifecycle });

      await $.nextTick();
      expect(lifecycle.onMount).toHaveBeenCalledTimes(1);
      lifecycle.onMount.mockClear();

      const navPromise = nav.navigate('/next');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      resolveAjax('<div>Updated</div>');
      await navPromise;
      await vi.waitFor(() => expect(nav.isPending.value).toBe(false));

      expect(lifecycle.onUnmount).toHaveBeenCalledWith(expect.anything(), '/');
      expect(lifecycle.onMount).toHaveBeenCalledWith(expect.anything(), '/next');
    });

    it('should correctly resolve race conditions between overlapping full navigations', async () => {
      let resolveA!: (v: boolean) => void;
      const hookA = new Promise<boolean>((res) => {
        resolveA = res;
      });

      const mountSpy = vi.fn();
      const nav = createNav({
        target: '#main-content',
        onMount: mountSpy,
        onBeforeLoad: (url) => (url === '/a' ? hookA : true),
      });

      // 1. Navigation A starts and hits a pending hook
      nav.navigate('/a');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      // 2. Navigation B starts immediately, which should abort A
      mockAjax('Page B');
      nav.navigate('/b');

      // 3. Navigation A's hook resolves, but it should be ignored
      resolveA(true);
      await vi.waitFor(() => expect($target.text()).toBe('Page B'));

      // Verification: Initial mount + Page B mount (A was skipped)
      expect(mountSpy).toHaveBeenCalledTimes(2);
      expect(nav.currentUrl.value).toBe('/b');
    });

    it('should abort full navigation if a hash transition or same-location request happens during hooks', async () => {
      let resolveA!: (v: boolean) => void;
      const hookA = new Promise<boolean>((res) => {
        resolveA = res;
      });

      const nav = createNav({
        target: '#main-content',
        onBeforeLoad: (url) => (url === '/a' ? hookA : true),
      });

      // Start A (pending hook)
      nav.navigate('/a');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      // Trigger hash transition (Phase 3) while A is pending
      nav.navigate('/#hash');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/#hash'));

      // Resolve A's hook
      resolveA(true);
      await $.nextTick();

      // Verification: URL remains at hash, not overwritten by /a
      expect(nav.currentUrl.value).toBe('/#hash');
    });
  });

  describe('Scroll Management', () => {
    it('should coordinate hash targeting, top-scrolling, and native popstate behavior', async () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const nav = createNav({ target: '#main-content' });

      // Case 1: Target an element via hash (including special chars)
      mockAjax('<div id="a.b:c">Target</div>');
      await nav.navigate('/p#a.b:c');
      await vi.waitFor(() => expect(scrollIntoViewSpy).toHaveBeenCalled());

      // Case 2: Standard internal navigation (should scroll to top)
      scrollSpy.mockClear();
      await nav.navigate('/q');
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));

      // Case 3: Same-page "#" anchor
      scrollSpy.mockClear();
      await nav.navigate('#');
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));

      // Case 4: Popstate (native restoration, usually doesn't force scroll)
      scrollSpy.mockClear();
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(scrollSpy).not.toHaveBeenCalled();

      scrollSpy.mockRestore();
    });
  });

  describe('Edge Cases & Recovery', () => {
    it('should follow server-side redirects via X-PJAX-URL and maintain state integrity', async () => {
      mockAjax('Final Body', false, { 'X-PJAX-URL': '/final' });
      const nav = createNav({ target: '#main-content' });

      await nav.navigate('/original');
      await vi.waitFor(() => {
        expect(nav.currentUrl.value).toBe('/final');
        expect(window.location.pathname).toBe('/final');
      });

      expect($target.text()).toBe('Final Body');
    });

    it('should fallback to hard navigation on critical AJAX failures', async () => {
      const assignMock = vi.fn();
      const mockWin = {
        location: { ...window.location, assign: assignMock },
        history: window.history,
        document: window.document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Window & typeof globalThis;

      mockAjax({ status: 500 }, true);
      const nav = createNav({ target: '#main-content', window: mockWin });

      await nav.navigate('/fail');
      await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/fail'));
    });

    it('should clean up all listeners and reactive memory upon destruction', async () => {
      const abortSpy = vi.fn();
      mockAjax().mockImplementation(() => {
        const p = new Promise<string>(() => {});
        return Object.assign(p, { abort: abortSpy }) as unknown as JQuery.jqXHR;
      });

      const nav = createNav({ target: '#main-content' });
      vi.spyOn(nav.currentUrl, 'dispose');

      nav.navigate('/pending');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      nav.destroy();
      expect(abortSpy).toHaveBeenCalled();
      expect(nav.currentUrl.dispose).toHaveBeenCalled();
      expect($target.attr('data-atom-nav-target')).toBeUndefined();
    });
  });
});
