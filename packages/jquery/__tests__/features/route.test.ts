import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import { LOG_PREFIXES } from '@/constants';
import type { Router } from '@/types';
import { debug } from '@/utils/debug';

describe('$.route() - SPA Routing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav>
        <a href="#home" data-route="home">Home</a>
        <a href="#about" data-route="about">About</a>
        <a href="#contact" data-route="contact">Contact</a>
      </nav>
      <div id="app"></div>
      <template id="tmpl-home"><h1>Home Page</h1><p>Welcome to home</p></template>
      <template id="tmpl-about"><h1>About Page</h1><p>About us</p></template>
      <template id="tmpl-contact"><h1>Contact Page</h1><p>Contact form here</p></template>
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

  describe('Core Functionality', () => {
    it('should initialize and render default route', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();

      expect(router.currentRoute.value).toBe('home');
      const appContent = document.querySelector('#app')?.innerHTML;
      expect(appContent).toContain('Home Page');
      expect(appContent).toContain('Welcome to home');
    });

    it('should handle various navigation patterns and route formats', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
          contact: { template: '#tmpl-contact' },
        },
      });

      // 1. Hash change navigation
      window.location.hash = '#about';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');
      expect(document.querySelector('#app')?.innerHTML).toContain('About Page');

      // 2. Programmatic navigation with name only
      router.navigate('contact');
      await $.nextTick();
      expect(window.location.hash).toBe('#contact');
      expect(router.currentRoute.value).toBe('contact');

      // 3. Navigation with query strings
      router.navigate('about?id=123');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');
      expect(router.queryParams.value).toEqual({ id: '123' });
      expect(window.location.hash).toBe('#about?id=123');

      // 4. Robustness: Handle multiple leading slashes
      router.navigate('///home');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('home');
      expect(window.location.hash).toBe('#home');

      router.destroy();
    });

    it('should handle 404s and empty hash fallback', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        notFound: 'notfound',
        routes: {
          home: { template: '#tmpl-home' },
          notfound: { template: '#tmpl-notfound' },
        },
      });

      expect(router.currentRoute.value).toBe('home');

      router.navigate('unknown-route');
      await $.nextTick();

      expect(document.querySelector('#app')?.innerHTML).toContain('404');
    });
  });

  describe('Declarative Features', () => {
    it('should bind links and manage active state/aria attributes', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        autoBindLinks: true,
        activeClass: 'active',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      const homeLink = document.querySelector('[data-route="home"]') as HTMLElement;
      const aboutLink = document.querySelector('[data-route="about"]') as HTMLElement;

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
    });

    it('should bind dynamically added [data-route] links and avoid leaks', async () => {
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

      const $newLink = $('<a href="#page2" data-route="page2">Page 2</a>').appendTo('#links');

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

  describe('Custom Rendering & Params', () => {
    it('should support custom render functions with parameters', async () => {
      const renderSpy = vi.fn(
        (
          container: HTMLElement,
          route: string,
          params: Record<string, string>,
          _unmount: (cleanupFn: () => void) => void,
          router: Router
        ) => {
          const currentParams = router.queryParams.value;
          container.innerHTML = `Route: ${route}, ID: ${currentParams.id}, Extra: ${params.extra}`;
        }
      );

      $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: renderSpy,
            onEnter: (params) => ({ ...params, extra: 'injected' }),
          },
        },
      });

      window.location.hash = '#home?id=42';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      // Called twice: once for default init, once for hashchange
      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(document.querySelector('#app')?.innerHTML).toContain(
        'Route: home, ID: 42, Extra: injected'
      );
    });

    it('should call registered onUnmount cleanups when transitioning routes', async () => {
      const cleanupSpy = vi.fn();

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: (el, _route, _params, onUnmount) => {
              el.innerHTML = 'Home';
              onUnmount(cleanupSpy);
            },
          },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      expect(cleanupSpy).not.toHaveBeenCalled();

      router.navigate('about');
      await $.nextTick();

      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      router.destroy();
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should trigger onEnter/onLeave and respect navigation guards', async () => {
      const onEnterHome = vi.fn();
      const onLeaveHome = vi.fn(() => true);
      const onLeaveAbout = vi.fn(() => false); // Block navigation

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home', onEnter: onEnterHome, onLeave: onLeaveHome },
          about: { template: '#tmpl-about', onLeave: onLeaveAbout },
          contact: { template: '#tmpl-contact' },
        },
      });

      await $.nextTick();
      expect(onEnterHome).toHaveBeenCalledTimes(1);

      router.navigate('about');
      await $.nextTick();
      expect(onLeaveHome).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value).toBe('about');

      // Navigate about -> contact (blocked)
      router.navigate('contact');
      await $.nextTick();
      expect(onLeaveAbout).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value).toBe('about');

      router.destroy();
    });

    it('should call global transition hooks with correct from/to', async () => {
      const beforeTransition = vi.fn();
      const afterTransition = vi.fn();

      const router = $.route({
        target: '#app',
        default: 'home',
        beforeTransition,
        afterTransition,
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();

      router.navigate('about');
      await $.nextTick();

      expect(beforeTransition).toHaveBeenCalledWith('home', 'about');
      expect(afterTransition).toHaveBeenCalledWith('home', 'about');

      router.destroy();
    });
  });

  describe('Template Hooks', () => {
    it('should call onMount with jQuery object of content children', async () => {
      const onMountSpy = vi.fn((_$content: JQuery) => {});

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home', onMount: onMountSpy },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      expect(onMountSpy).toHaveBeenCalledTimes(1);
      expect(onMountSpy.mock.calls[0]![0]).toBeInstanceOf($);

      // Re-entry check
      router.navigate('about');
      await $.nextTick();
      router.navigate('home');
      await $.nextTick();

      expect(onMountSpy).toHaveBeenCalledTimes(2);

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

  describe('queryParams atom behavior', () => {
    it('should manage reactive param updates efficiently', async () => {
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
      expect(router.queryParams.value).toEqual({});
      spy.mockClear();

      // 1. Basic update
      window.location.hash = '#home?id=42&tab=info';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();
      expect(router.queryParams.value).toEqual({ id: '42', tab: 'info' });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockClear();

      // 2. Redundant update prevention (different order, same content)
      router.navigate('home?tab=info&id=42');
      await $.nextTick();
      expect(spy).not.toHaveBeenCalled();

      // 3. Robustness: Multiple question marks preserved in value
      router.navigate('home?target=page?id=123');
      await $.nextTick();
      expect(router.queryParams.value.target).toBe('page?id=123');

      router.destroy();
    });

    it('should be read-only', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });
      await $.nextTick();
      expect(() => {
        // @ts-expect-error: property is readonly
        router.queryParams.value = { foo: 'bar' };
      }).toThrow();
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
