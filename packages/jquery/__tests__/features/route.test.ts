import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import { LOG_PREFIXES } from '@/constants';
import { debug } from '@/utils/debug';

describe('$.route() - SPA Routing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav>
        <a href="#home" id="nav-home" data-route>Home</a>
        <a href="#about" id="nav-about" data-route>About</a>
        <a href="#contact" id="nav-contact" data-route>Contact</a>
        <a href="#user/42" id="nav-user" data-route>User</a>
        <a href="https://example.com" id="nav-external">External</a>
      </nav>
      <div id="app"></div>
      <template id="tmpl-home" data-path="home" data-default><h1>Home Page</h1><p>Welcome to home</p></template>
      <template id="tmpl-about" data-path="about"><h1>About Page</h1><p>About us</p></template>
      <template id="tmpl-contact" data-path="contact"><h1>Contact Page</h1><p>Contact form here</p></template>
      <template id="tmpl-user" data-path="user/:id"><h1>User Page</h1><p>ID: <span id="user-id"></span></p></template>
      <template id="tmpl-notfound"><h1>404</h1><p>Page not found</p></template>
    `;
    window.location.hash = '';
    debug.enabled = false;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  describe('Core Navigation & Path Discovery', () => {
    it('should initialize and render default route (including auto-discovery)', async () => {
      // Test explicit config
      const router1 = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });
      await $.nextTick();
      expect(router1.currentRoute.value).toBe('home');
      expect(document.querySelector('#app')?.innerHTML).toContain('Home Page');
      router1.destroy();

      // Test auto-discovery from DOM
      const router2 = $.route({ target: '#app' });
      await $.nextTick();
      expect(router2.currentRoute.value).toBe('home'); // from data-default
      expect(document.querySelector('#app')?.innerHTML).toContain('Home Page');
      router2.destroy();
    });

    it('should handle navigation across different formats (hash, programmatic, dynamic)', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
          'user/:id': { template: '#tmpl-user' },
        },
      });
      await $.nextTick();

      // 1. Hash change
      window.location.hash = '#about';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');

      // 2. Programmatic & Normalization
      router.navigate('///home');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('home');
      expect(window.location.hash).toBe('#home');

      // 3. Dynamic segments
      router.navigate('user/42');
      await $.nextTick();
      expect(router.params.value).toEqual({ id: '42' });
      expect(router.currentRoute.value).toBe('user/42');

      router.destroy();
    });

    it('should handle 404s and fallback routes', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        notFound: 'notfound',
        routes: {
          home: { template: '#tmpl-home' },
          notfound: { template: '#tmpl-notfound' },
        },
      });

      router.navigate('unknown-route');
      await $.nextTick();
      expect(document.querySelector('#app')?.innerHTML).toContain('404');
      router.destroy();
    });

    it('should bind standard <a href> links and manage active state/aria attributes', async () => {
      const router = $.route({
        target: '#app',
        autoBindLinks: true,
        activeClass: 'active',
      });

      const homeLink = document.querySelector('#nav-home') as HTMLElement;
      const aboutLink = document.querySelector('#nav-about') as HTMLElement;
      const externalLink = document.querySelector('#nav-external') as HTMLElement;

      await $.nextTick();

      expect(homeLink.classList.contains('active')).toBe(true);
      expect(homeLink.getAttribute('aria-current')).toBe('page');
      expect(aboutLink.classList.contains('active')).toBe(false);

      aboutLink.click();
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(homeLink.classList.contains('active')).toBe(false);
      expect(aboutLink.classList.contains('active')).toBe(true);
      expect(aboutLink.getAttribute('aria-current')).toBe('page');

      // Interception should ignore cross-origin / standard overrides
      externalLink.click();
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about'); // unchanged

      router.destroy();
    });

    it('should bind dynamically added a[href] links and avoid leaks', async () => {
      document.body.innerHTML = '<div id="app"></div><div id="links"></div>';

      const router = $.route({
        target: '#app',
        default: 'home',
        autoBindLinks: true,
        activeClass: 'active-link',
        routes: {
          home: {
            render: (el) => {
              el.innerHTML = 'Home';
            },
          },
          page2: {
            render: (el) => {
              el.innerHTML = 'Page2';
            },
          },
        },
      });

      await $.nextTick();

      const $newLink = $('<a href="#page2" data-route>Page 2</a>').appendTo('#links');

      $newLink[0]!.click();
      await $.nextTick();

      expect(router.currentRoute.value).toBe('page2');
      expect($newLink.hasClass('active-link')).toBe(true);

      // Verify removal does not cause errors during next navigation
      $newLink.remove();
      router.navigate('home');
      await $.nextTick();

      expect(router.currentRoute.value).toBe('home');

      router.destroy();
    });
  });

  describe('Rendering & Lifecycle Hooks', () => {
    it('should support custom rendering and manage component lifecycles (onMount/onUnmount)', async () => {
      const cleanupSpy = vi.fn();
      const onMountSpy = vi.fn();
      const renderSpy = vi.fn((container, route, params, onUnmount) => {
        container.innerHTML = `Route: ${route}, Extra: ${params.extra}`;
        onUnmount(cleanupSpy);
      });

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: renderSpy,
            onEnter: (params) => ({ ...params, extra: 'data' }),
          },
          about: { template: '#tmpl-about', onMount: onMountSpy },
        },
      });

      await $.nextTick();
      expect(renderSpy).toHaveBeenCalled();
      expect(document.querySelector('#app')?.innerHTML).toContain('Extra: data');

      // Transition to template-based route
      router.navigate('about');
      await $.nextTick();
      expect(cleanupSpy).toHaveBeenCalled(); // clean up 'home'
      expect(onMountSpy).toHaveBeenCalled(); // mount 'about'
      expect(onMountSpy.mock.calls[0]![0]).toBeInstanceOf($);

      router.destroy();
    });
  });

  describe('Navigation Guards & Transition Hooks', () => {
    it('should respect enter/leave guards and trigger global hooks', async () => {
      const onLeaveAbout = vi.fn(() => false); // Block
      const beforeSpy = vi.fn();
      const afterSpy = vi.fn();

      const router = $.route({
        target: '#app',
        default: 'home',
        beforeTransition: beforeSpy,
        afterTransition: afterSpy,
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about', onLeave: onLeaveAbout },
          contact: { template: '#tmpl-contact' },
        },
      });

      await $.nextTick();

      // Successful move: home -> about
      router.navigate('about');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');
      expect(beforeSpy).toHaveBeenCalledWith('home', 'about');
      expect(afterSpy).toHaveBeenCalledWith('home', 'about');

      // Blocked move: about -> contact
      router.navigate('contact');
      await $.nextTick();
      expect(onLeaveAbout).toHaveBeenCalled();
      expect(router.currentRoute.value).toBe('about'); // Stayed

      router.destroy();
    });
  });

  describe('History Mode', () => {
    it('should render default route and navigate via pushState', async () => {
      const pushStateSpy = vi.spyOn(history, 'pushState');

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      expect(router.currentRoute.value).toBe('home');

      router.navigate('about');
      await $.nextTick();

      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/about');
      expect(router.currentRoute.value).toBe('about');

      router.destroy();
    });

    it('should handle popstate event and onLeave guards', async () => {
      const replaceStateSpy = vi.spyOn(history, 'replaceState');

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
          about: {
            template: '#tmpl-about',
            onLeave: () => false, // Block navigation
          },
        },
      });

      await $.nextTick();
      router.navigate('about'); // Initial navigate
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');

      // Simulate browser "Back" but blocked by onLeave
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/home' },
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new window.Event('popstate'));
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', expect.stringContaining('/about'));

      router.destroy();
    });

    it('should handle exact basePath matching and search params', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/app/detail', search: '?id=99' },
        writable: true,
        configurable: true,
      });

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        basePath: '/app',
        routes: {
          home: { template: '#tmpl-home' },
          detail: {
            render: (el, _, params) => {
              el.innerHTML = `ID: ${params.id}`;
            },
          },
        },
      });

      await $.nextTick();
      expect(router.currentRoute.value).toBe('detail');
      expect(document.querySelector('#app')?.innerHTML).toContain('ID: 99');

      // Negative check for basePath prefix match vs exact segment match
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/app-settings' },
        writable: true,
        configurable: true,
      });
      // A new router starting at /app-settings with base /app should go to default if not matched
      const router2 = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        basePath: '/app',
        routes: { home: { template: '#tmpl-home' } },
      });
      await $.nextTick();
      // '/app-settings' starts with '/app', but it should not be treated as root segment if not followed by / or exact
      expect(router2.currentRoute.value).not.toBe('-settings');

      router.destroy();
      router2.destroy();
    });
  });

  describe('Query Parameters', () => {
    it('should manage reactive query params efficiently', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });

      const spy = vi.fn();
      $.effect(() => {
        spy(router.queryParams.value);
        return undefined;
      });

      await $.nextTick();
      spy.mockClear();

      // 1. Basic update & Reactivity
      window.location.hash = '#home?id=42&tab=info';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();
      expect(router.queryParams.value).toEqual({ id: '42', tab: 'info' });
      expect(spy).toHaveBeenCalledTimes(1);

      // 2. Redundant update prevention
      router.navigate('home?tab=info&id=42');
      await $.nextTick();
      expect(spy).toHaveBeenCalledTimes(1); // No new call

      // 3. Robustness
      router.navigate('home?target=page?id=123');
      await $.nextTick();
      expect(router.queryParams.value.target).toBe('page?id=123');

      router.destroy();
    });
  });

  describe('Safety & Error Handling', () => {
    it('should handle malformed URL parameters gracefully', async () => {
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true;

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: (el) => {
              el.innerHTML = 'Home';
            },
          },
        },
      });

      window.location.hash = '#home?bad=%FF%FE';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();
      expect(warnSpy).toHaveBeenCalledWith(
        LOG_PREFIXES.ROUTE,
        expect.stringContaining('Malformed URI')
      );

      router.destroy();
    });

    it('continues navigation even if pushState throws in history mode', async () => {
      const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {
        throw new DOMException('SecurityError', 'SecurityError');
      });
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true;

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      router.navigate('about');
      await $.nextTick();

      expect(pushStateSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        LOG_PREFIXES.ROUTE,
        expect.stringContaining('PushState failed'),
        expect.anything()
      );
      expect(router.currentRoute.value).toBe('about');

      router.destroy();
    });

    it('warns when route or template not found', async () => {
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true;

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#nonexistent' },
        },
      });

      await $.nextTick();
      expect(warnSpy).toHaveBeenCalledWith(
        LOG_PREFIXES.ROUTE,
        expect.stringMatching(/Template.*#nonexistent.*not found/)
      );

      router.navigate('nonexistent');
      await $.nextTick();
      expect(warnSpy).toHaveBeenCalledWith(
        LOG_PREFIXES.ROUTE,
        expect.stringMatching(/Route.*nonexistent.*not found/)
      );

      router.destroy();
    });
  });
});
