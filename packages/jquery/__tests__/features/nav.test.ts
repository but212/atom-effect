import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import type { AtomNav, AtomNavOptions } from '@/types';

describe('$.atomNav', () => {
  let $target: JQuery;
  let navs: AtomNav[] = [];

  // Helper to mock $.ajax with proper abort behavior
  const mockAjax = (data?: unknown, shouldFail = false) => {
    return vi.spyOn($, 'ajax').mockImplementation(() => {
      let rejectPromise: (reason: unknown) => void;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let _resolvePromise: (value: unknown) => void;

      const promise = new Promise((resolve, reject) => {
        _resolvePromise = resolve;
        rejectPromise = reject;

        if (shouldFail && data !== undefined) {
          reject(data);
        } else if (!shouldFail && data !== undefined) {
          resolve(data);
        }
      });

      return Object.assign(promise, {
        abort: vi.fn(() => {
          rejectPromise({ statusText: 'abort', readyState: 0 });
        }),
        // Add other common jqXHR methods to avoid errors
        getResponseHeader: vi.fn(),
        getAllResponseHeaders: vi.fn(),
        setRequestHeader: vi.fn(),
        overrideMimeType: vi.fn(),
        statusCode: vi.fn(),
        state: vi.fn(),
        always: vi.fn(),
        catch: promise.catch.bind(promise),
        pipe: vi.fn(),
        then: promise.then.bind(promise),
        promise: () => promise,
      }) as unknown as JQuery.jqXHR;
    });
  };

  beforeEach(() => {
    $target = $('<div id="main-content">Original Content</div>').appendTo('body');
    window.history.replaceState(null, '', '/');
    navs = [];
    // Default mock to prevent real network calls
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

  it('should initialize and expose reactive states', () => {
    const nav = createNav({
      target: '#main-content',
    });

    expect($.isAtom(nav.currentUrl)).toBe(true);
    expect($.isAtom(nav.isPending)).toBe(true);
    expect($.isAtom(nav.hasError)).toBe(true);
  });

  it('should intercept link clicks and update content', async () => {
    mockAjax('<div>Page 1 Content</div>');

    createNav({
      target: '#main-content',
      selector: 'a.nav-link',
    });

    const $link = $('<a href="/page1" class="nav-link">Page 1</a>').appendTo('body');

    // Click link
    const event = $.Event('click');
    $link.trigger(event);

    expect(event.isDefaultPrevented()).toBe(true);

    await vi.waitFor(() => {
      expect($target.html()).toBe('<div>Page 1 Content</div>');
    });

    expect(window.location.pathname).toBe('/page1');
  });

  it('should show pending state during load', async () => {
    let resolveAjax!: (v: string) => void;
    vi.spyOn($, 'ajax').mockImplementation(() => {
      const promise = new Promise<string>((resolve) => {
        resolveAjax = resolve;
      });
      return Object.assign(promise, {
        abort: vi.fn(),
        catch: promise.catch.bind(promise),
        then: promise.then.bind(promise),
      }) as unknown as JQuery.jqXHR;
    });

    const nav = createNav({ target: '#main-content' });

    nav.navigate('/slow-page');

    await $.nextTick();
    await $.nextTick();

    expect(nav.isPending.value).toBe(true);

    resolveAjax('<div>Slow Content</div>');

    await vi.waitFor(() => {
      expect($target.html()).toBe('<div>Slow Content</div>');
    });

    expect(nav.isPending.value).toBe(false);
  });

  it('should handle errors and set hasError', async () => {
    mockAjax(new Error('404 Not Found'), true);

    const nav = createNav({ target: '#main-content' });

    nav.navigate('/error-page');

    await vi.waitFor(() => {
      expect(nav.hasError.value).toBe(true);
    });

    expect($target.html()).toBe('Original Content');
  });

  it('should call atomUnbind() on target before replacing content', async () => {
    const unbindSpy = vi.fn();
    const originalUnbind = $.fn.atomUnbind;
    $.fn.atomUnbind = function () {
      if (this[0] === $target[0]) unbindSpy();
      return originalUnbind.apply(this);
    };

    try {
      mockAjax('<div>New Content</div>');
      createNav({ target: '#main-content' });

      window.history.pushState(null, '', '/new');
      window.dispatchEvent(new PopStateEvent('popstate'));

      await vi.waitFor(() => {
        expect($target.html()).toBe('<div>New Content</div>');
      });

      expect(unbindSpy).toHaveBeenCalled();
    } finally {
      $.fn.atomUnbind = originalUnbind;
    }
  });

  it('should execute onMount and onUnmount hooks', async () => {
    const onMount = vi.fn();
    const onUnmount = vi.fn();

    mockAjax('<div>Hook Content</div>');
    createNav({
      target: '#main-content',
      onMount,
      onUnmount,
    });

    window.history.pushState(null, '', '/hooks');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await vi.waitFor(() => {
      expect($target.html()).toBe('<div>Hook Content</div>');
    });

    expect(onUnmount).toHaveBeenCalledWith(expect.any(Object), '/');
    expect(onMount).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('/hooks'));
  });

  it('should support onBeforeLoad for cancellation', async () => {
    const onBeforeLoad = vi.fn(() => false);

    const ajaxSpy = mockAjax('<div>Should not see this</div>');

    const nav = createNav({
      target: '#main-content',
      onBeforeLoad,
    });

    nav.navigate('/blocked');

    await $.nextTick();
    await $.nextTick();

    expect(onBeforeLoad).toHaveBeenCalledWith(expect.stringContaining('/blocked'));
    expect(nav.currentUrl.value).not.toContain('/blocked');
    // The spy might have been called for initial '/' fetch, so we check if it was called for '/blocked'
    const calls = ajaxSpy.mock.calls;
    const blockedCall = calls.find((call) =>
      (call[0] as JQuery.AjaxSettings).url?.includes('/blocked')
    );
    expect(blockedCall).toBeUndefined();
  });

  it('should sync document title if response contains <title> tag (even in fragments)', async () => {
    const originalTitle = document.title;

    // Test 1: Fragment with title
    mockAjax('<div><title>Fragment Title</title><span>Content</span></div>');
    const nav = createNav({ target: '#main-content' });

    nav.navigate('/title-fragment');
    await vi.waitFor(() => {
      expect(document.title).toBe('Fragment Title');
    });

    // Test 2: Fragment WITHOUT title (should keep previous title)
    mockAjax('<div>No new title here</div>');
    nav.navigate('/no-title');

    // We wait a bit to ensure it doesn't change
    await new Promise((r) => setTimeout(r, 50));
    expect(document.title).toBe('Fragment Title');

    document.title = originalTitle;
  });

  it('should scroll to top when navigation completes', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mockAjax('<div>New Content</div>');

    const nav = createNav({ target: '#main-content' });
    nav.navigate('/scroll-test');

    await vi.waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith(0, 0);
    });

    scrollSpy.mockRestore();
  });
});
