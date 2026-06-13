import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

/**
 * HTML Templates for Integration Tests
 */
const TEMPLATE = {
  SETTINGS: `
    <div id="settings-layout">
      <h2>Settings</h2>
      <nav class="tabs">
        <a data-route="profile" href="#profile">Profile</a>
        <a data-route="security" href="#security">Security</a>
      </nav>
      <div id="settings-view"></div>
      <template id="tpl-profile"><div id="profile-page">Profile Content</div></template>
      <template id="tpl-security"><div id="security-page">Security Content</div></template>
    </div>
  `,
  HOME: '<h1>Home</h1>',
  EMPTY: '<div id="sub-target"></div>',
  META: '<meta name="description" content="PJAX Desc"><div id="sub-meta"></div>',
  SCROLL: '<div id="sub-scroll"><div id="section-a" style="margin-top:1000px">A</div></div>',
  SWAP: '<div id="swap-sub"><a data-route="x" href="#x">X</a><a data-route="y" href="#y">Y</a></div>',
};

/**
 * Utility to setup AJAX mocks for PJAX/Navigation tests
 */
function setupMockAjax(responses: Record<string, string | { html: string; url?: string }>) {
  return vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
    const url = settings?.url || '';
    const response = Object.entries(responses).find(([pattern]) => url.includes(pattern))?.[1];

    const xhr = {
      getResponseHeader: (name: string) => {
        if (name === 'X-PJAX-URL') {
          return typeof response === 'object' ? response.url || url : url;
        }
        return null;
      },
      abort: vi.fn(),
      status: 200,
      statusText: 'OK',
    } as unknown as JQuery.jqXHR;

    const deferred = $.Deferred<unknown, unknown, unknown>();

    if (response) {
      const html = typeof response === 'object' ? response.html : response;
      deferred.resolve(html, 'success', xhr);
      return Object.assign(deferred.promise(), xhr);
    }

    return $.Deferred<unknown, unknown, unknown>().reject(xhr).promise() as JQuery.jqXHR;
  });
}

describe('Routing Synergy: atomNav & $.route Integration', () => {
  let activeManagers: { destroy: () => void }[] = [];

  const track = <T extends { destroy: () => void }>(manager: T): T => {
    activeManagers.push(manager);
    return manager;
  };

  const setup = (html = '<div id="app"></div>') => {
    const $target = $(html).appendTo(document.body);
    return { $target, track };
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    activeManagers = [];
    $.initAEJ({ autoCleanup: true });
  });

  afterEach(() => {
    for (const m of activeManagers) {
      m.destroy();
    }
    $(document.body).empty();
    $.initAEJ({ autoCleanup: false });
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  describe('Hierarchical Composition', () => {
    it('should coordinate atomNav (layout) and $.route (sub-views)', async () => {
      const { $target: $app, track } = setup();
      const $navMenu = $('<nav><a data-nav href="/settings">Settings</a></nav>').appendTo(
        document.body
      );

      setupMockAjax({ settings: TEMPLATE.SETTINGS, home: TEMPLATE.HOME });

      let destroyCount = 0;
      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el, url) => {
            if (url.includes('settings')) {
              const router = $.route({
                target: $el.find('#settings-view'),
                routes: {
                  profile: { template: '#tpl-profile' },
                  security: { template: '#tpl-security' },
                },
                default: 'profile',
                autoBindLinks: true,
              });

              const orig = router.destroy.bind(router);
              router.destroy = () => {
                destroyCount++;
                orig();
              };
            }
          },
        })
      );

      // 1. Initial Load
      $navMenu.find('a')[0]?.click();
      await vi.waitFor(() => expect($('#profile-page').length).toBe(1));

      // 2. Sub-route Navigation
      $('#settings-layout a[data-route="security"]').click();
      await vi.waitFor(() => expect($('#security-page').length).toBe(1));

      // 3. Parent Navigation (Cleanup Trigger)
      await nav.navigate('/home');
      await vi.waitFor(() => expect($('#app h1').text()).toBe('Home'));

      expect(destroyCount).toBe(1);
    });
  });

  describe('Coordination & Protection', () => {
    it('should respect nested route guards during atomNav transitions', async () => {
      const { $target: $app, track } = setup();
      let allowLeave = true;

      setupMockAjax({ guarded: TEMPLATE.EMPTY, other: '<div>Other</div>' });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el, url) => {
            if (url.includes('guarded')) {
              $.route({
                target: $el.find('#sub-target'),
                routes: {
                  form: {
                    render: (el) => $(el).html('<div id="dirty">Unsaved</div>'),
                    onLeave: () => allowLeave,
                  },
                },
                default: 'form',
              });
            }
          },
        })
      );

      await nav.navigate('/guarded');
      await vi.waitFor(() => expect($('#dirty').length).toBe(1));

      // Blocked
      allowLeave = false;
      await nav.navigate('/other');
      await new Promise((r) => setTimeout(r, 50));
      expect($('#dirty').length).toBe(1);
      expect(window.location.pathname).toBe('/guarded');

      // Allowed
      allowLeave = true;
      await nav.navigate('/other');
      await vi.waitFor(() => expect($app.text()).toContain('Other'));
    });

    it('should isolate traffic via selector and basePath coordination', async () => {
      const { $target: $pjaxArea, track } = setup('<div id="pjax"></div>');
      const { $target: $adminArea } = setup('<div id="admin"></div>');
      const $nav = $(`
        <nav>
          <a class="p-link" href="/dash">Dash</a>
          <a class="a-link" href="/admin/set">Admin</a>
        </nav>
      `).appendTo(document.body);

      const ajaxSpy = setupMockAjax({ dash: '<div>Dash Content</div>' });

      track($.atomNav({ target: $pjaxArea, selector: 'a.p-link' }));
      track(
        $.route({
          target: $adminArea,
          basePath: '/admin',
          routes: { set: { render: (el) => $(el).html('<div id="admin-view">Admin</div>') } },
          mode: 'history',
          autoBindLinks: true,
        })
      );

      // Route manager takes /admin/set
      $nav.find('.a-link')[0]?.click();
      expect(window.location.pathname).toBe('/admin/set');
      expect($adminArea.find('#admin-view').length).toBe(1);
      expect(ajaxSpy).not.toHaveBeenCalled();

      // Nav manager takes /dash
      $nav.find('.p-link')[0]?.click();
      await vi.waitFor(() => expect($pjaxArea.text()).toContain('Dash Content'));
      expect(window.location.pathname).toBe('/dash');
    });

    it('should prevent double updates on popstate when both managers listen', async () => {
      const { $target: $navArea, track } = setup('<div id="nav-area"></div>');
      const { $target: $routeArea } = setup('<div id="route-area"></div>');

      let renderCount = 0;
      const ajaxSpy = setupMockAjax({ page: '<div>PJAX</div>' });

      track($.atomNav({ target: $navArea }));
      track(
        $.route({
          target: $routeArea,
          mode: 'history',
          routes: {
            page: {
              render: (el) => {
                renderCount++;
                $(el).html('<div>Route</div>');
              },
            },
          },
          autoBindLinks: false,
        })
      );

      window.history.pushState(null, '', '/page');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise((r) => setTimeout(r, 150));

      expect(ajaxSpy).toHaveBeenCalledTimes(1);
      expect(renderCount).toBe(1);
    });
  });

  describe('Lifecycle & Resources', () => {
    it('should detect and warn about target container collisions', () => {
      const { $target, track } = setup();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      track($.atomNav({ target: $target }));
      track($.route({ target: $target, routes: {} }));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[atom-navigation] Target collision detected!')
      );
    });

    it('should automatically destroy managers when target is removed from DOM', async () => {
      const { $target, track } = setup();
      const ajaxSpy = setupMockAjax({ test: '<div></div>' });

      track($.atomNav({ target: $target }));
      track($.route({ target: $target, routes: {} }));

      $target.remove();
      await $.nextTick();

      // Attempt navigation - should be ignored as managers are destroyed
      window.history.pushState(null, '', '/test');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise((r) => setTimeout(r, 100));

      expect(ajaxSpy).not.toHaveBeenCalled();
    });

    it('should push history only once when overlapping selectors match a link', async () => {
      const { $target: $app, track } = setup();
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      setupMockAjax({ shared: '<div>Shared</div>' });

      track($.atomNav({ target: $app, selector: 'a.shared' }));
      track(
        $.route({
          target: '#other',
          routes: { shared: { render: () => {} } },
          autoBindLinks: true,
          mode: 'history',
        })
      );

      const $link = $('<a class="shared" href="/shared" data-route="shared">Go</a>').appendTo(
        document.body
      );
      $link[0]?.click();
      await new Promise((r) => setTimeout(r, 100));

      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should fully dispose nested router and its reactions on atomNav transition', async () => {
      const { $target: $app, track } = setup();
      let popstateReactions = 0;

      setupMockAjax({
        page1: '<div id="r1"></div>',
        page2: '<div>Page 2</div>',
      });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el, url) => {
            if (url.includes('page1')) {
              const router = $.route({
                target: $el.find('#r1'),
                routes: { a: { render: (el) => $(el).html('<div id="route-a">A</div>') } },
                default: 'a',
                mode: 'history',
                basePath: '/page1',
              });

              const orig = router.navigate.bind(router);
              router.navigate = (p) => {
                popstateReactions++;
                return orig(p);
              };
            }
          },
        })
      );

      await nav.navigate('/page1');
      await vi.waitFor(() => expect($('#route-a').length).toBe(1));

      await nav.navigate('/page2');
      await vi.waitFor(() => expect($app.text()).toContain('Page 2'));

      popstateReactions = 0;
      window.history.pushState(null, '', '/page1/b');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise((r) => setTimeout(r, 100));

      expect(popstateReactions).toBe(0);
    });
  });

  describe('Browser Integration & State', () => {
    it('should resolve document.title deterministically (most specific wins)', async () => {
      const { $target: $app, track } = setup();
      setupMockAjax({ titled: '<title>PJAX Title</title><div id="sub"></div>' });

      const nav = track(
        $.atomNav({
          target: $app,
          syncTitle: true,
          onMount: ($el) => {
            track(
              $.route({
                target: $el.find('#sub'),
                routes: {
                  home: { title: 'Route Title', render: (el) => $(el).html('<div>Home</div>') },
                },
                default: 'home',
              })
            );
          },
        })
      );

      await nav.navigate('/titled');
      await vi.waitFor(() => expect($app.find('#sub').length).toBe(1));
      expect(document.title).toBe('Route Title');
    });

    it('should preserve PJAX meta tags when sub-route has no meta defined', async () => {
      const { $target: $app, track } = setup();
      setupMockAjax({ metapage: TEMPLATE.META });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el) => {
            track(
              $.route({
                target: $el.find('#sub-meta'),
                routes: { view: { render: (el) => $(el).html('<div>View</div>') } },
                default: 'view',
              })
            );
          },
        })
      );

      await nav.navigate('/metapage');
      await vi.waitFor(() => expect($app.find('#sub-meta').length).toBe(1));
      const desc = document.querySelector('meta[name="description"]');
      expect(desc?.getAttribute('content')).toBe('PJAX Desc');
    });

    it('should not reset scroll when hash target exists in sub-route', async () => {
      const { $target: $app, track } = setup();
      const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      setupMockAjax({ scrollpage: TEMPLATE.SCROLL });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el) => {
            track(
              $.route({
                target: $el.find('#sub-scroll'),
                routes: {
                  content: {
                    render: (el) =>
                      $(el).html('<div id="section-a" style="margin-top:1000px">A</div>'),
                  },
                },
                default: 'content',
              })
            );
          },
        })
      );

      await nav.navigate('/scrollpage#section-a');
      await vi.waitFor(() => expect($app.find('#sub-scroll').length).toBe(1));

      const resetCalls = (scrollToSpy.mock.calls as [number, number][]).filter(
        ([x, y]) => x === 0 && y === 0
      );
      expect(resetCalls.length).toBe(0);
    });

    it('should not steal focus during atomNav transition', async () => {
      const { $target: $app, track } = setup();
      const $input = $('<input id="ext" />').appendTo(document.body);
      ($input[0] as HTMLInputElement).focus();

      setupMockAjax({ focuspage: '<div id="f-sub"></div>' });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el) => {
            track(
              $.route({
                target: $el.find('#f-sub'),
                routes: {
                  main: { render: (el) => $(el).html('<h1>Header</h1><p>text</p>') },
                },
                default: 'main',
              })
            );
          },
        })
      );

      await nav.navigate('/focuspage');
      await vi.waitFor(() => expect($('#f-sub h1').length).toBe(1));
      expect(document.activeElement).not.toBe($('#f-sub h1')[0]);
    });

    it('should handle router initialization after redirected PJAX load', async () => {
      const { $target: $app, track } = setup();
      setupMockAjax({ start: { html: '<div id="root"></div>', url: '/target' } });

      let inited = false;
      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el, url) => {
            if (url === '/target') {
              track(
                $.route({
                  target: $el.find('#root'),
                  routes: { target: { render: (el) => $(el).html('<div id="v"></div>') } },
                  default: 'target',
                })
              );
              inited = true;
            }
          },
        })
      );

      await nav.navigate('/start');
      await vi.waitFor(() => {
        expect(window.location.pathname).toBe('/target');
        expect(inited).toBe(true);
        expect($('#v').length).toBe(1);
      });
    });

    it('should not emit spurious route-change events during atomNav transitions', async () => {
      const { $target: $app, track } = setup();
      const routeChanges: Array<{ from: string; to: string }> = [];

      window.addEventListener('route-change', ((e: CustomEvent) => {
        routeChanges.push(e.detail);
      }) as EventListener);

      setupMockAjax({
        first: '<div id="sub1"></div>',
        second: '<div id="sub2"></div>',
      });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el, url) => {
            const subId = url.includes('first') ? '#sub1' : '#sub2';
            track(
              $.route({
                target: $el.find(subId),
                routes: { view: { render: (el) => $(el).html('<div>View</div>') } },
                default: 'view',
              })
            );
          },
        })
      );

      await nav.navigate('/first');
      await vi.waitFor(() => expect($('#sub1').length).toBe(1));

      routeChanges.length = 0;
      await nav.navigate('/second');
      await vi.waitFor(() => expect($('#sub2').length).toBe(1));

      expect(routeChanges.length).toBe(1);
      expect(routeChanges[0]?.to).toBe('view');
    });

    it('should not apply stale active classes during atomNav DOM swap', async () => {
      const { $target: $app, track } = setup();
      setupMockAjax({
        swap1: TEMPLATE.SWAP,
        swap2: '<div id="swap-sub2"><a data-route="z" href="#z">Z</a></div>',
      });

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($el, url) => {
            const sel = url.includes('swap1') ? '#swap-sub' : '#swap-sub2';
            track(
              $.route({
                target: $el.find(sel),
                routes: {
                  x: { render: (el) => $(el).html('<div>X</div>') },
                  z: { render: (el) => $(el).html('<div>Z</div>') },
                },
                default: url.includes('swap1') ? 'x' : 'z',
                activeClass: 'is-active',
              })
            );
          },
        })
      );

      await nav.navigate('/swap1');
      await vi.waitFor(() => expect($('#swap-sub').length).toBe(1));

      await nav.navigate('/swap2');
      await vi.waitFor(() => expect($('#swap-sub2').length).toBe(1));

      const stale = document.querySelectorAll('.is-active');
      const activeInNew = $('#swap-sub2 .is-active');
      expect(stale.length).toBe(activeInNew.length);
    });
  });
});
