import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';

describe('Nav & Route Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  });

  it('should work together: nav managers layout, route manages sub-view', async () => {
    // 1. Setup Base DOM
    const $app = $('<div id="app">').appendTo(document.body);
    const $navMenu = $(
      '<nav id="main-nav"><a data-nav href="/settings">Settings</a></nav>'
    ).appendTo(document.body);

    const settingsHtml = `
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
    `;

    // 2. Mock AJAX for nav
    const ajaxSpy = vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
      const xhr = {
        getResponseHeader: (name: string) =>
          name === 'X-PJAX-URL' ? (settings?.url ?? '/settings') : null,
        abort: vi.fn(),
        status: 200,
        statusText: 'OK',
      } as unknown as JQuery.jqXHR;
      const deferred = $.Deferred<unknown, unknown, unknown>();

      if (settings?.url?.includes('settings')) {
        deferred.resolve(settingsHtml, 'success', xhr);
        return Object.assign(deferred.promise(), xhr);
      }
      if (settings?.url?.includes('home')) {
        deferred.resolve('<h1>Home</h1>', 'success', xhr);
        return Object.assign(deferred.promise(), xhr);
      }
      return $.Deferred<unknown, unknown, unknown>()
        .reject(xhr)
        .promise() as unknown as JQuery.jqXHR;
    });

    // 3. Initialize Nav
    let routerDestroyed = false;
    const nav = $.atomNav({
      target: $app,
      window: window,
      onMount: ($target, url) => {
        if (url.includes('settings')) {
          const router = $.route({
            target: $target.find('#settings-view'), // Now allowed by types!
            routes: {
              profile: { template: '#tpl-profile' },
              security: { template: '#tpl-security' },
            },
            default: 'profile',
            mode: 'hash',
            autoBindLinks: true,
          });
          const originalDestroy = router.destroy.bind(router);
          router.destroy = () => {
            routerDestroyed = true;
            originalDestroy();
          };
        }
      },
    });

    // 4. Go to Settings
    $navMenu.find('a[data-nav]')[0]?.click();

    await vi.waitFor(
      () => {
        if ($('#settings-view #profile-page').length === 0) throw new Error('Settings not loaded');
      },
      { timeout: 2000 }
    );

    expect($('#profile-page').text()).toBe('Profile Content');

    // 5. Switch Route
    $('#settings-layout a[data-route="security"]').click();
    await vi.waitFor(() => {
      if ($('#security-page').length === 0) throw new Error('Security page not loaded');
    });

    // 6. Cleanup Verification
    await nav.navigate('/home');
    await vi.waitFor(() => {
      if ($('#app h1').text() !== 'Home') throw new Error('Home not loaded');
    });

    await vi.waitFor(() => {
      if (!routerDestroyed) throw new Error('Router was not destroyed');
    });

    $app.remove();
    $navMenu.remove();
    ajaxSpy.mockRestore();
  });

  it('should handle nested navigation guards (onBeforeLoad + onLeave) with synergy', async () => {
    const $app = $('<div id="app">').appendTo(document.body);
    let allowLeave = true;

    const ajaxSpy = vi.spyOn($, 'ajax').mockImplementation((_settings?: JQuery.AjaxSettings) => {
      const xhr = { getResponseHeader: () => null, abort: vi.fn() } as unknown as JQuery.jqXHR;
      const deferred = $.Deferred<unknown, unknown, unknown>();
      deferred.resolve('<div id="sub-target"></div>', 'success', xhr);
      return Object.assign(deferred.promise(), xhr);
    });

    const nav = $.atomNav({
      target: $app,
      window: window,
      onMount: (_, url) => {
        if (url.includes('form')) {
          $.route({
            target: '#sub-target',
            routes: {
              step1: {
                render: (el) => $(el).html('<div id="step-1-view">Step-1</div>'),
                onLeave: () => allowLeave,
              },
              step2: {
                render: (el) => $(el).html('<div id="step-2-view">Step-2</div>'),
              },
            },
            default: 'step1',
          });
        }
      },
    });

    await nav.navigate('/form');

    await vi.waitFor(() => {
      if ($('#step-1-view').length === 0) throw new Error('Form step 1 not found');
    });

    allowLeave = false;
    window.location.hash = '#step2';

    await new Promise((r) => setTimeout(r, 100));
    expect($('#step-1-view').length).toBe(1);

    ajaxSpy.mockRestore();
  });

  it('should support Traffic Control: Selector Isolation and Base Path Isolation', async () => {
    // 1. Setup Base DOM with two distinct zones
    const $pjaxArea = $('<div id="pjax-container">').appendTo(document.body);
    const $adminArea = $('<div id="admin-container">').appendTo(document.body);

    const $navMenu = $(`
      <nav id="top-nav">
        <!-- atomNav target: should be intercepted by selector isolation -->
        <a class="nav-link" href="/dashboard">Dashboard</a>
        <!-- $.route target: within /admin basePath -->
        <a data-route="settings" href="/admin/settings">Admin Settings</a>
        <!-- Normal link: should be ignored by both if configured -->
        <a href="/external" rel="external">External</a>
      </nav>
    `).appendTo(document.body);

    // 2. Mock AJAX for PJAX
    const ajaxSpy = vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
      const xhr = {
        getResponseHeader: (name: string) => (name === 'X-PJAX-URL' ? (settings?.url ?? '') : null),
        abort: vi.fn(),
      } as unknown as JQuery.jqXHR;
      const deferred = $.Deferred();

      if (settings?.url === '/dashboard') {
        deferred.resolve('<div id="dash-view">Dashboard Content</div>', 'success', xhr);
        return Object.assign(deferred.promise(), xhr);
      }
      return $.Deferred<unknown, unknown, unknown>()
        .reject(xhr)
        .promise() as unknown as JQuery.jqXHR;
    });

    // 3. Initialize atomNav with Selector Isolation
    const nav = $.atomNav({
      target: $pjaxArea,
      selector: 'a.nav-link', // Only intercept links with .nav-link
      window: window,
    });

    // 4. Initialize $.route with Base Path Isolation
    const router = $.route({
      target: $adminArea,
      basePath: '/admin',
      routes: {
        settings: {
          render: (el) => $(el).html('<div id="admin-settings-view">Admin Settings Content</div>'),
        },
      },
      mode: 'history',
      autoBindLinks: true, // Uses [data-route] and basePath logic
    });

    // Test A: Selector Isolation - atomNav ignores data-route links
    $navMenu.find('a[data-route="settings"]')[0]?.click();

    // URL should be updated to /admin/settings by router
    expect(window.location.pathname).toBe('/admin/settings');
    // $.route should have rendered
    expect($adminArea.find('#admin-settings-view').text()).toBe('Admin Settings Content');
    // atomNav should NOT have triggered (no dashboard content in pjax area)
    expect($pjaxArea.find('#dash-view').length).toBe(0);
    // atomNav AJAX should NOT have been called
    expect(ajaxSpy).not.toHaveBeenCalled();

    // Test B: Base Path Isolation - $.route ignores .nav-link outside /admin
    $navMenu.find('a.nav-link')[0]?.click();

    // atomNav should trigger AJAX for /dashboard
    await vi.waitFor(
      () => {
        if ($pjaxArea.find('#dash-view').length === 0) throw new Error('Dashboard not loaded');
      },
      { timeout: 2000 }
    );

    expect(window.location.pathname).toBe('/dashboard');
    expect(ajaxSpy).toHaveBeenCalledWith(expect.objectContaining({ url: '/dashboard' }));

    // $.route should NOT have changed (should still show settings or be empty/default)
    // In this test, it still shows admin-settings because nothing cleared it
    expect($adminArea.find('#admin-settings-view').length).toBe(1);

    ajaxSpy.mockRestore();
    nav.destroy();
    router.destroy();
  });
});
