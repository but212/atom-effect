import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $, { type AtomNav, type AtomNavOptions } from '@/index';

/**
 * Test Utilities & Mocks
 */
interface AjaxMockOptions {
  data?: unknown;
  shouldFail?: boolean;
  headers?: Record<string, string>;
  delay?: number;
}

function mockAjax(options: AjaxMockOptions = {}) {
  return vi.spyOn($, 'ajax').mockImplementation(() => {
    let rejectPromise: (reason: unknown) => void;
    const promise = new Promise((resolve, reject) => {
      rejectPromise = reject;
      const executor = () => {
        if (options.shouldFail) reject(options.data);
        else resolve(options.data);
      };
      if (options.delay) setTimeout(executor, options.delay);
      else executor();
    });

    return Object.assign(promise, {
      abort: vi.fn(() => rejectPromise({ statusText: 'abort' })),
      getResponseHeader: vi.fn((name: string) => options.headers?.[name] || null),
      getAllResponseHeaders: vi.fn(() => ''),
      setRequestHeader: vi.fn(),
      statusCode: vi.fn(),
      promise: () => promise,
    }) as unknown as JQuery.jqXHR;
  });
}

function simulateClick(el: HTMLElement | undefined, options: MouseEventInit = {}) {
  if (!el) return;
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
  el.dispatchEvent(event);
  return event;
}

describe('$.atomNav', () => {
  let $target: JQuery;
  let activeNavs: AtomNav[] = [];

  const createNav = async (options: AtomNavOptions) => {
    const nav = $.atomNav(options);
    activeNavs.push(nav);
    await $.nextTick();
    return nav;
  };

  beforeEach(() => {
    $target = $('<div id="main-content">Original</div>').appendTo('body');
    window.history.replaceState(null, '', '/');
    activeNavs = [];
    mockAjax({ data: 'Initial' });
  });

  afterEach(() => {
    activeNavs.forEach((nav) => nav.destroy());
    $target.children().atomUnbind();
    $target.remove();
    $('.nav-link').remove();
    $('base').remove();
    $('meta[name="description"], meta[name="keywords"]').remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Core Initialization', () => {
    it('should initialize with correct reactive atoms', async () => {
      const nav = await createNav({ target: '#main-content' });

      expect($.isAtom(nav.currentUrl)).toBe(true);
      expect($.isAtom(nav.isPending)).toBe(true);
      expect($.isAtom(nav.hasError)).toBe(true);
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  describe('Navigation Policy & Interception', () => {
    const scenarios = [
      { label: 'Standard same-origin link', href: '/page1', expected: true },
      { label: 'External domain', href: 'https://google.com', expected: false },
      {
        label: 'New tab (target="_blank")',
        href: '/page2',
        attrs: { target: '_blank' },
        expected: false,
      },
      { label: 'Download link', href: '/doc.pdf', attrs: { download: '' }, expected: false },
      { label: 'Mailto protocol', href: 'mailto:test@ex.com', expected: false },
      { label: 'Data URI', href: 'data:text/plain,hi', expected: false },
      {
        label: 'Disabled via data-nav',
        href: '/off',
        attrs: { 'data-nav': 'false' },
        expected: false,
      },
      { label: 'Right click', href: '/right', event: { button: 2 }, expected: false },
    ];

    it.each(scenarios)('should $label correctly', async ({
      href,
      expected,
      attrs = {},
      event = {},
    }) => {
      const ajaxSpy = mockAjax();
      await createNav({ target: '#main-content', selector: '.nav-link' });
      const $link = $('<a class="nav-link"></a>')
        .attr({ href, ...attrs })
        .appendTo('body');

      let intercepted = false;
      const checkIntercept = (e: Event) => {
        intercepted = e.defaultPrevented;
        e.preventDefault();
      };
      document.addEventListener('click', checkIntercept, { once: true });

      simulateClick($link[0], event);

      if (expected) {
        expect(intercepted).toBe(true);
        await vi.waitFor(() => expect(ajaxSpy).toHaveBeenCalled());
      } else {
        expect(ajaxSpy).not.toHaveBeenCalled();
      }
      $link.remove();
    });

    it('should resolve paths relative to <base> tag', async () => {
      const ajaxSpy = mockAjax({ data: 'Base Content' });
      const nav = await createNav({ target: '#main-content', selector: '.nav-link' });
      const $base = $('<base href="/app/">').appendTo('head');
      const $link = $('<a href="sub" class="nav-link"></a>').appendTo('body');

      simulateClick($link[0]);

      await vi.waitFor(() => expect(nav.currentUrl.value).toContain('/app/sub'));
      expect(ajaxSpy).toHaveBeenCalled();
      $base.remove();
    });

    it('should cancel navigation if onBeforeLoad returns false', async () => {
      const ajaxSpy = mockAjax();
      const nav = await createNav({ target: '#main-content', onBeforeLoad: () => false });

      await nav.navigate('/forbidden');
      expect(ajaxSpy).not.toHaveBeenCalled();
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  describe('DOM Reconciliation & State Sync', () => {
    const HTML_FRAG = `
      <html>
        <head><title>New Title</title><meta name="description" content="new"></head>
        <body><div id="main-content" class="new-cls" data-new="1"><h1>Loaded</h1></div></body>
      </html>
    `;

    it('should sync content, title, and metadata', async () => {
      $('<meta name="description" content="old">').appendTo('head');
      mockAjax({ data: HTML_FRAG });
      const nav = await createNav({ target: '#main-content', syncTitle: true });

      await nav.navigate('/sync');

      await vi.waitFor(() => {
        expect($target.find('h1').text()).toBe('Loaded');
        expect(document.title).toBe('New Title');
        expect($('meta[name="description"]').attr('content')).toBe('new');
      });

      expect($target.hasClass('new-cls')).toBe(true);
      expect($target.attr('data-new')).toBe('1');
    });

    it('should purge stale attributes and meta tags', async () => {
      $('<meta name="description" content="stale">').appendTo('head');
      mockAjax({ data: '<div id="main-content">Fresh</div>' });
      $target.attr('data-stale', 'yes');
      const nav = await createNav({ target: '#main-content' });

      await nav.navigate('/purge');

      await vi.waitFor(() => {
        expect($target.attr('data-temp')).toBeUndefined(); // data-temp is not set in this test, but data-stale is
        expect($target.attr('data-stale')).toBeUndefined();
        expect($('meta[name="description"]').length).toBe(0);
      });
    });
  });

  describe('Lifecycle & Concurrency', () => {
    it('should handle pending state and mounting lifecycle', async () => {
      let resolveFetch!: (v: string) => void;
      vi.spyOn($, 'ajax').mockImplementation(() => {
        const p = new Promise<string>((res) => {
          resolveFetch = res;
        });
        return Object.assign(p, { abort: vi.fn() }) as unknown as JQuery.jqXHR;
      });

      const hooks = { onMount: vi.fn(), onUnmount: vi.fn() };
      const nav = await createNav({ target: '#main-content', ...hooks });

      expect(hooks.onMount).toHaveBeenCalledTimes(1);
      hooks.onMount.mockClear();

      const p = nav.navigate('/next');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      resolveFetch('<div>Done</div>');
      await p;

      await vi.waitFor(() => expect(nav.isPending.value).toBe(false));
      expect(hooks.onUnmount).toHaveBeenCalled();
      expect(hooks.onMount).toHaveBeenCalledWith(expect.anything(), '/next');
    });

    it('should resolve race conditions (last navigation wins)', async () => {
      let resolveFirst!: (v: boolean) => void;
      const firstHook = new Promise<boolean>((res) => {
        resolveFirst = res;
      });
      const mountSpy = vi.fn();
      const nav = await createNav({
        target: '#main-content',
        onMount: mountSpy,
        onBeforeLoad: (url) => (url === '/a' ? firstHook : true),
      });

      nav.navigate('/a');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      mockAjax({ data: 'Page B' });
      nav.navigate('/b');

      resolveFirst(true);
      await vi.waitFor(() => expect($target.text()).toBe('Page B'));
      expect(nav.currentUrl.value).toBe('/b');
      expect(mountSpy).toHaveBeenCalledTimes(2);
    });

    it('should cancel pending navigation if hash change occurs', async () => {
      let resolveFirst!: (v: boolean) => void;
      const hook = new Promise<boolean>((res) => {
        resolveFirst = res;
      });
      const nav = await createNav({
        target: '#main-content',
        onBeforeLoad: (url) => (url === '/slow' ? hook : true),
      });

      nav.navigate('/slow');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      nav.navigate('/#hash');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/#hash'));

      resolveFirst(true);
      await $.nextTick();
      expect(nav.currentUrl.value).toBe('/#hash');
    });
  });

  describe('Scroll Management', () => {
    it('should handle hash scrolling and top reset', async () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const nav = await createNav({ target: '#main-content' });

      mockAjax({ data: '<div id="target">Target</div>' });
      await nav.navigate('/page#target');
      await vi.waitFor(() => expect(scrollIntoViewSpy).toHaveBeenCalled());

      scrollSpy.mockClear();
      await nav.navigate('/top');
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));

      scrollSpy.mockRestore();
    });
  });

  describe('Regression Tests', () => {
    it('should follow X-PJAX-URL redirects', async () => {
      mockAjax({ data: 'Redirected', headers: { 'X-PJAX-URL': '/target' } });
      const nav = await createNav({ target: '#main-content' });

      await nav.navigate('/source');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/target'));
      expect(window.location.pathname).toBe('/target');
    });

    it('should fallback to hard reload on AJAX failure', async () => {
      const assignSpy = vi.fn();
      const mockWin = {
        location: { ...window.location, assign: assignSpy },
        history: window.history,
        document: window.document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Window & typeof globalThis;

      mockAjax({ data: 'Error', shouldFail: true });
      const nav = await createNav({ target: '#main-content', window: mockWin });

      await nav.navigate('/fail');
      await vi.waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/fail'));
    });

    it('should clean up resources on destruction', async () => {
      const abortSpy = vi.fn();
      vi.spyOn($, 'ajax').mockImplementation(() => {
        const p = new Promise<string>(() => {});
        return Object.assign(p, { abort: abortSpy }) as unknown as JQuery.jqXHR;
      });

      const nav = await createNav({ target: '#main-content' });
      vi.spyOn(nav.currentUrl, 'dispose');

      nav.navigate('/pending');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      nav.destroy();
      expect(abortSpy).toHaveBeenCalled();
      expect(nav.currentUrl.dispose).toHaveBeenCalled();
      expect($target.attr('data-atom-nav-target')).toBeUndefined();
    });

    it('should skip re-fetch for same-path hash changes', async () => {
      const ajaxSpy = mockAjax({ data: 'Content' });
      const nav = await createNav({ target: '#main-content' });

      ajaxSpy.mockClear();
      await nav.navigate('/#new');
      expect(ajaxSpy).not.toHaveBeenCalled();
      expect(nav.currentUrl.value).toContain('#new');
    });

    it('should not perform AJAX fetch for initial match', async () => {
      const ajaxSpy = mockAjax({ data: 'Initial' });
      await createNav({ target: '#main-content' });
      expect(ajaxSpy).not.toHaveBeenCalled();
    });

    it('should allow retrying failed same-URL navigation', async () => {
      const nav = await createNav({ target: '#main-content', onError: () => false });
      const failSpy = mockAjax({ data: 'Fail', shouldFail: true });

      await nav.navigate('/retry');
      await vi.waitFor(() => expect(nav.hasError.value).toBe(true));

      failSpy.mockRestore();
      const successSpy = mockAjax({ data: 'Success' });
      await nav.navigate('/retry');

      await vi.waitFor(() => {
        expect(successSpy).toHaveBeenCalled();
        expect(nav.hasError.value).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should prevent infinite loops when onMount triggers navigation', async () => {
      mockAjax({ data: 'Content' });
      let count = 0;
      const nav = await createNav({
        target: '#main-content',
        onMount: () => {
          count++;
          if (count === 1) nav.navigate('/');
        },
      });

      await nav.navigate('/');
      await $.nextTick();
      expect(count).toBe(1);
    });

    it('should correctly intercept cross-page hash links', async () => {
      const ajaxSpy = mockAjax({ data: 'Cross' });
      await createNav({ target: '#main-content', selector: '.nav-link' });

      const $same = $('<a href="#s" class="nav-link"></a>').appendTo('body');
      simulateClick($same[0]);
      expect(ajaxSpy).not.toHaveBeenCalled();

      const $cross = $('<a href="/other#s" class="nav-link"></a>').appendTo('body');
      simulateClick($cross[0]);
      await vi.waitFor(() => expect(ajaxSpy).toHaveBeenCalled());
    });
  });
});
