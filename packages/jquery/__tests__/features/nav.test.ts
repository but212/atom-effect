import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $, { type AtomNav, type AtomNavOptions } from '@/index';
import { castTo, createMockJqXHR } from '../utils/test-helpers';

/**
 * Constants & Test Data
 */
const DEFAULT_TARGET = '#main-content';
const HTML_FULL_PAGE = `
  <html>
    <head><title>New Title</title><meta name="description" content="new"></head>
    <body><div id="main-content" class="new-cls" data-new="1"><h1>Loaded</h1></div></body>
  </html>
`;

/**
 * Test Harness for $.atomNav
 */
class NavTestHarness {
  private activeNavs: AtomNav[] = [];
  public $target!: JQuery;

  setup() {
    this.$target = $(`<div id="${DEFAULT_TARGET.slice(1)}">Original</div>`).appendTo('body');
    window.history.replaceState(null, '', '/');
    this.activeNavs = [];
  }

  teardown() {
    for (const nav of this.activeNavs) {
      nav.destroy();
    }
    this.$target.remove();
    $('.nav-link, base, meta[name="description"], meta[name="keywords"]').remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }

  async create(options: Partial<AtomNavOptions> = {}) {
    const nav = $.atomNav({ target: DEFAULT_TARGET, ...options });
    this.activeNavs.push(nav);
    await $.nextTick();
    return nav;
  }

  mockAjax(
    options: {
      data?: unknown;
      shouldFail?: boolean;
      headers?: Record<string, string>;
      delay?: number;
    } = {}
  ) {
    return vi.spyOn($, 'ajax').mockImplementation(() => {
      let rejectPromise: (reason: unknown) => void;
      const promise = new Promise((resolve, reject) => {
        rejectPromise = reject;
        const executor = () => (options.shouldFail ? reject(options.data) : resolve(options.data));
        if (options.delay) setTimeout(executor, options.delay);
        else executor();
      });

      return createMockJqXHR(promise, {
        abort: vi.fn(() => rejectPromise({ statusText: 'abort' })),
        getResponseHeader: vi.fn((name: string) => options.headers?.[name] || null),
        getAllResponseHeaders: vi.fn(() => ''),
        setRequestHeader: vi.fn(),
        statusCode: vi.fn(),
        promise: () => promise,
      });
    });
  }

  simulateClick(el: HTMLElement | undefined, options: MouseEventInit = {}) {
    if (!el) return;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
    el.dispatchEvent(event);
    return event;
  }
}

describe('$.atomNav', () => {
  const harness = new NavTestHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.teardown());

  describe('Core Initialization', () => {
    it('should initialize with correct reactive atoms', async () => {
      const nav = await harness.create();
      expect($.isAtom(nav.currentUrl)).toBe(true);
      expect($.isAtom(nav.isPending)).toBe(true);
      expect($.isAtom(nav.hasError)).toBe(true);
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  describe('Navigation Policy & Interception', () => {
    const scenarios = [
      { label: 'same-origin link', href: '/page1', expected: true },
      { label: 'external domain', href: 'https://google.com', expected: false },
      { label: 'new tab', href: '/page2', attrs: { target: '_blank' }, expected: false },
      { label: 'download link', href: '/doc.pdf', attrs: { download: '' }, expected: false },
      { label: 'data-nav="false"', href: '/off', attrs: { 'data-nav': 'false' }, expected: false },
      { label: 'right click', href: '/right', event: { button: 2 }, expected: false },
    ];

    it.each(scenarios)('should handle $label correctly', async ({
      href,
      expected,
      attrs,
      event,
    }) => {
      const ajaxSpy = harness.mockAjax();
      await harness.create({ selector: '.nav-link' });
      const $link = $('<a class="nav-link"></a>')
        .attr({ href, ...attrs })
        .appendTo('body');

      let intercepted = false;
      const checkIntercept = (e: Event) => {
        intercepted = e.defaultPrevented;
        e.preventDefault();
      };
      document.addEventListener('click', checkIntercept, { once: true });

      harness.simulateClick($link[0], event);

      if (expected) {
        expect(intercepted).toBe(true);
        await vi.waitFor(() => expect(ajaxSpy).toHaveBeenCalled());
      } else {
        expect(ajaxSpy).not.toHaveBeenCalled();
      }
      $link.remove();
    });

    it('should resolve paths relative to <base> tag', async () => {
      harness.mockAjax({ data: 'Base Content' });
      const nav = await harness.create({ selector: '.nav-link' });
      $('<base href="/app/">').appendTo('head');
      const $link = $('<a href="sub" class="nav-link"></a>').appendTo('body');

      harness.simulateClick($link[0]);
      await vi.waitFor(() => expect(nav.currentUrl.value).toContain('/app/sub'));
    });

    it('should cancel navigation if onBeforeLoad returns false', async () => {
      const ajaxSpy = harness.mockAjax();
      const nav = await harness.create({ onBeforeLoad: () => false });

      await nav.navigate('/forbidden');
      expect(ajaxSpy).not.toHaveBeenCalled();
      expect(nav.currentUrl.value).toBe('/');
    });
  });

  describe('DOM Reconciliation & State Sync', () => {
    it('should sync content, title, and metadata', async () => {
      $('<meta name="description" content="old">').appendTo('head');
      harness.mockAjax({ data: HTML_FULL_PAGE });
      const nav = await harness.create({ syncTitle: true });

      await nav.navigate('/sync');

      await vi.waitFor(() => {
        expect(harness.$target.find('h1').text()).toBe('Loaded');
        expect(document.title).toBe('New Title');
        expect($('meta[name="description"]').attr('content')).toBe('new');
      });

      expect(harness.$target.hasClass('new-cls')).toBe(true);
      expect(harness.$target.attr('data-new')).toBe('1');
    });

    it('should purge stale attributes and meta tags', async () => {
      $('<meta name="description" content="stale">').appendTo('head');
      harness.mockAjax({ data: '<div id="main-content">Fresh</div>' });
      harness.$target.attr('data-stale', 'yes');
      const nav = await harness.create();

      await nav.navigate('/purge');

      await vi.waitFor(() => {
        expect(harness.$target.attr('data-stale')).toBeUndefined();
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
        return createMockJqXHR(p, { abort: vi.fn() });
      });

      const hooks = { onMount: vi.fn(), onUnmount: vi.fn() };
      const nav = await harness.create(hooks);

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
      const nav = await harness.create({
        onMount: mountSpy,
        onBeforeLoad: (url) => (url === '/a' ? firstHook : true),
      });

      nav.navigate('/a');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      harness.mockAjax({ data: 'Page B' });
      nav.navigate('/b');

      resolveFirst(true);
      await vi.waitFor(() => expect(harness.$target.text()).toBe('Page B'));
      expect(nav.currentUrl.value).toBe('/b');
      expect(mountSpy).toHaveBeenCalledTimes(2);
    });

    it('should cancel pending navigation if hash change occurs', async () => {
      let resolveFirst!: (v: boolean) => void;
      const hook = new Promise<boolean>((res) => {
        resolveFirst = res;
      });
      const nav = await harness.create({
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

      const nav = await harness.create();

      harness.mockAjax({ data: '<div id="target">Target</div>' });
      await nav.navigate('/page#target');
      await vi.waitFor(() => expect(scrollIntoViewSpy).toHaveBeenCalled());

      scrollSpy.mockClear();
      await nav.navigate('/top');
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 0));

      scrollSpy.mockRestore();
    });

    it('should perform scroll when navigating to same path with a hash', async () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const nav = await harness.create();
      // Initially navigate to /same-path
      harness.mockAjax({ data: '<div id="sec">Section</div>' });
      await nav.navigate('/same-path');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/same-path'));

      // Navigate to /same-path#sec
      await nav.navigate('/same-path#sec');
      await vi.waitFor(() => expect(scrollIntoViewSpy).toHaveBeenCalled());

      scrollSpy.mockRestore();
    });
  });

  describe('PJAX Optimizations & Header Support', () => {
    it('should send X-PJAX-Container header with the correct selector', async () => {
      const ajaxSpy = harness.mockAjax({ data: 'Content' });
      const nav = await harness.create();

      await nav.navigate('/headers');

      await vi.waitFor(() => {
        expect(ajaxSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-PJAX': 'true',
              'X-PJAX-Container': DEFAULT_TARGET,
            }),
          })
        );
      });
    });

    it('should prioritize X-PJAX-Title header over <title> tag in body', async () => {
      harness.mockAjax({
        data: '<div><title>Body Title</title>Content</div>',
        headers: { 'X-PJAX-Title': 'Header Title' },
      });
      const nav = await harness.create();

      await nav.navigate('/title-priority');

      await vi.waitFor(() => {
        expect(document.title).toBe('Header Title');
      });
    });

    it('should fallback to <title> tag in body if X-PJAX-Title header is an empty string', async () => {
      harness.mockAjax({
        data: '<div><title>Body Title</title>Content</div>',
        headers: { 'X-PJAX-Title': '' },
      });
      const nav = await harness.create();

      await nav.navigate('/title-empty-header-fallback');

      await vi.waitFor(() => {
        expect(document.title).toBe('Body Title');
      });
    });

    it.each([
      {
        label: 'partial fragment',
        data: '<div id="main-content">Fragment Content</div>',
        expected: 'Fragment Content',
      },
      { label: 'inner HTML only', data: 'Only Inner Content', expected: 'Only Inner Content' },
    ])('should correctly handle $label', async ({ data, expected }) => {
      harness.mockAjax({ data });
      const nav = await harness.create();

      await nav.navigate('/content');

      await vi.waitFor(() => {
        expect(harness.$target.text()).toBe(expected);
      });
    });
  });

  describe('Regression & Cleanup', () => {
    it('should skip re-fetch for same-path hash changes', async () => {
      const ajaxSpy = harness.mockAjax({ data: 'Content' });
      const nav = await harness.create();

      ajaxSpy.mockClear();
      await nav.navigate('/#new');
      expect(ajaxSpy).not.toHaveBeenCalled();
      expect(nav.currentUrl.value).toContain('#new');
    });

    it('should not perform AJAX fetch for initial match', async () => {
      const ajaxSpy = harness.mockAjax({ data: 'Initial' });
      await harness.create();
      expect(ajaxSpy).not.toHaveBeenCalled();
    });

    it('should follow X-PJAX-URL redirects', async () => {
      harness.mockAjax({ data: 'Redirected', headers: { 'X-PJAX-URL': '/target' } });
      const nav = await harness.create();

      await nav.navigate('/source');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/target'));
    });

    it('should fallback to hard reload on AJAX failure', async () => {
      const assignSpy = vi.fn();
      const mockWin = castTo<Window & typeof globalThis>({
        location: { ...window.location, assign: assignSpy },
        history: window.history,
        document: window.document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      harness.mockAjax({ data: 'Error', shouldFail: true });
      const nav = await harness.create({ window: mockWin });

      await nav.navigate('/fail');
      await vi.waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/fail'));
    });

    it('should clean up resources on destruction', async () => {
      const abortSpy = vi.fn();
      vi.spyOn($, 'ajax').mockImplementation(() => {
        const p = new Promise<string>(() => {});
        return createMockJqXHR(p, { abort: abortSpy });
      });

      const nav = await harness.create();
      vi.spyOn(nav.currentUrl, 'dispose');

      nav.navigate('/pending');
      await vi.waitFor(() => expect(nav.isPending.value).toBe(true));

      nav.destroy();
      expect(abortSpy).toHaveBeenCalled();
      expect(nav.currentUrl.dispose).toHaveBeenCalled();
      expect(harness.$target.attr('data-atom-nav-target')).toBeUndefined();
    });

    it('should not crash navigation if previous curRendered.url is invalid/malformed', async () => {
      const mockWin = castTo<Window & typeof globalThis>({
        location: window.location,
        history: {
          ...window.history,
          replaceState: vi.fn(),
          pushState: vi.fn(),
        },
        document: window.document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        scrollTo: vi.fn(),
      });

      const nav = await harness.create({ window: mockWin });

      // 1. First navigation redirects to a malformed URL (e.g., http://%)
      harness.mockAjax({
        data: 'Redirected Page',
        headers: { 'X-PJAX-URL': 'http://%' },
      });
      await nav.navigate('/source');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('http://%'));

      // 2. Second navigation should succeed and not throw despite the previous malformed URL
      harness.mockAjax({ data: 'Second Page' });
      await nav.navigate('/target');
      await vi.waitFor(() => expect(nav.currentUrl.value).toBe('/target'));
    });

    it('should allow retrying failed same-URL navigation', async () => {
      const nav = await harness.create({ onError: () => false });
      const failSpy = harness.mockAjax({ data: 'Fail', shouldFail: true });

      await nav.navigate('/retry');
      await vi.waitFor(() => expect(nav.hasError.value).toBe(true));

      failSpy.mockRestore();
      const successSpy = harness.mockAjax({ data: 'Success' });
      await nav.navigate('/retry');

      await vi.waitFor(() => {
        expect(successSpy).toHaveBeenCalled();
        expect(nav.hasError.value).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should prevent infinite loops when onMount triggers navigation', async () => {
      harness.mockAjax({ data: 'Content' });
      let mountCount = 0;
      let scheduledNavigation = Promise.resolve();
      let nav: AtomNav | undefined;

      nav = await harness.create({
        onMount: () => {
          mountCount++;
          if (mountCount === 1) {
            scheduledNavigation = new Promise<void>((resolve) => {
              setTimeout(async () => {
                await nav?.navigate('/');
                resolve();
              }, 0);
            });
          }
        },
      });

      const navigateSpy = vi.spyOn(nav, 'navigate');
      await scheduledNavigation;
      await $.nextTick();

      expect(navigateSpy).toHaveBeenCalledWith('/');
      expect(mountCount).toBe(1);
    });

    it('should correctly intercept cross-page hash links', async () => {
      const ajaxSpy = harness.mockAjax({ data: 'Cross' });
      await harness.create({ selector: '.nav-link' });

      const $same = $('<a href="#s" class="nav-link"></a>').appendTo('body');
      harness.simulateClick($same[0]);
      expect(ajaxSpy).not.toHaveBeenCalled();

      const $cross = $('<a href="/other#s" class="nav-link"></a>').appendTo('body');
      harness.simulateClick($cross[0]);
      await vi.waitFor(() => expect(ajaxSpy).toHaveBeenCalled());
    });

    it('should ignore click interception if data-target does not match target id', async () => {
      const ajaxSpy = harness.mockAjax();
      await harness.create({ selector: '.nav-link' });

      const $link = $(
        '<a class="nav-link" data-target="#other-target" href="/other"></a>'
      ).appendTo('body');

      let intercepted = false;
      const checkIntercept = (e: Event) => {
        intercepted = e.defaultPrevented;
        e.preventDefault(); // Prevent Vitest browser iframe navigation!
      };
      document.addEventListener('click', checkIntercept, { once: true });

      harness.simulateClick($link[0]);
      await $.nextTick();

      expect(intercepted).toBe(false);
      expect(ajaxSpy).not.toHaveBeenCalled();
      $link.remove();
    });

    it('should assign location when navigating to a different origin', async () => {
      const assignSpy = vi.fn();
      const mockWin = castTo<Window & typeof globalThis>({
        location: { ...window.location, assign: assignSpy, href: 'http://localhost/' },
        history: window.history,
        document: window.document,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const nav = await harness.create({ window: mockWin });
      await nav.navigate('https://google.com');

      expect(assignSpy).toHaveBeenCalledWith('https://google.com');
    });
  });
});
