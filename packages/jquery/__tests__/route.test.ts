import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index';
import { debug } from '../src/debug';

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
    // Reset debug state
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

    it('should navigate via hash change and programmatic API', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
          contact: { template: '#tmpl-contact' },
        },
      });

      // Hash change navigation
      window.location.hash = '#about';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(document.querySelector('#app')?.innerHTML).toContain('About Page');

      // Programmatic navigation
      router.navigate('contact');
      await $.nextTick();

      expect(window.location.hash).toBe('#contact');
      expect(router.currentRoute.value).toBe('contact');
      expect(document.querySelector('#app')?.innerHTML).toContain('Contact Page');
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

      // Default fallback
      expect(router.currentRoute.value).toBe('home');

      // 404 handling
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

      // Initial state
      expect(homeLink.classList.contains('active')).toBe(true);
      expect(homeLink.getAttribute('aria-current')).toBe('page');
      expect(aboutLink.classList.contains('active')).toBe(false);

      // Navigation via click
      aboutLink.click();
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(homeLink.classList.contains('active')).toBe(false);
      expect(aboutLink.classList.contains('active')).toBe(true);
      expect(aboutLink.getAttribute('aria-current')).toBe('page');
    });
  });

  describe('Custom Rendering & Params', () => {
    it('should support custom render functions with parameters', async () => {
      const renderSpy = vi.fn(
        (container: HTMLElement, route: string, params: Record<string, string>) => {
          container.innerHTML = `Route: ${route}, ID: ${params.id}`;
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

      expect(renderSpy).toHaveBeenCalledTimes(2);
      const args = renderSpy.mock.calls[1];
      // container, route, params
      expect(args[2]).toEqual({ id: '42', extra: 'injected' });
      expect(document.querySelector('#app')?.innerHTML).toContain('Route: home, ID: 42');
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

      // Navigate home -> about
      router.navigate('about');
      await $.nextTick();
      expect(onLeaveHome).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value).toBe('about');

      // Navigate about -> contact (blocked)
      router.navigate('contact');
      await $.nextTick();
      expect(onLeaveAbout).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value).toBe('about'); // Should remain
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
    });
  });

  describe('Lifecycle & Cleanup', () => {
    it('should clean up listeners on destroy', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        autoBindLinks: true,
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      router.destroy();

      // Listener cleanup (simulated by hash change not affecting router)
      const initialRoute = router.currentRoute.value;
      window.location.hash = '#about';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(router.currentRoute.value).toBe(initialRoute);
    });

    it('should auto-cleanup when target element is removed', async () => {
      document.body.innerHTML = `
        <div id="wrapper"><div id="app"></div></div>
        <template id="tmpl-home"><h1>Home</h1></template>
      `;

      const _router = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });

      // Spy on destroy mechanism indirectly via event listener removal
      const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

      document.getElementById('app')?.remove();

      // Wait for MutationObserver (Auto-cleanup is async)
      await new Promise((r) => setTimeout(r, 50));

      expect(removeListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });
  });

  describe('Integration', () => {
    it('should integrate seamlessly with computed atoms and effects', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      const pageTitle = $.computed(() => `Title: ${router.currentRoute.value.toUpperCase()}`);
      const logSpy = vi.fn();

      $.effect(() => logSpy(pageTitle.value));

      expect(pageTitle.value).toBe('Title: HOME');

      router.navigate('about');
      await $.nextTick();

      expect(pageTitle.value).toBe('Title: ABOUT');
      expect(logSpy).toHaveBeenCalledWith('Title: ABOUT');
    });

    it('should support multiple router instances', async () => {
      document.body.innerHTML = `
        <div id="main"></div><div id="side"></div>
        <template id="t1">Main</template><template id="t2">Side</template>
      `;

      $.route({ target: '#main', default: 'main', routes: { main: { template: '#t1' } } });
      $.route({ target: '#side', default: 'side', routes: { side: { template: '#t2' } } });

      await $.nextTick();
      expect(document.querySelector('#main')?.innerHTML).toContain('Main');
      expect(document.querySelector('#side')?.innerHTML).toContain('Side');
    });
  });

  describe('Route Resolution Edge Cases', () => {
    it('warns when route not found and no notFound configured (lines 102-104)', async () => {
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true;

      const router = $.route({
        target: '#app',
        default: 'home',
        // No notFound configured
        routes: {
          home: { template: '#tmpl-home' },
        },
      });

      router.navigate('nonexistent');
      await $.nextTick();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found and no notFound route configured')
      );

      router.destroy();
    });

    it('warns when template selector does not exist (lines 117-119)', async () => {
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true;

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#nonexistent-template' },
        },
      });

      await $.nextTick();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template "#nonexistent-template" not found')
      );

      router.destroy();
    });

    it('restores hash when onLeave guard blocks hashchange navigation (lines 220-224)', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: { template: '#tmpl-home' },
          about: {
            template: '#tmpl-about',
            onLeave: () => false, // Block leaving about
          },
        },
      });

      // Navigate to about first
      router.navigate('about');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');

      // Try to navigate via hashchange (simulating back button)
      window.location.hash = '#home';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      // Navigation should be blocked and hash restored
      expect(router.currentRoute.value).toBe('about');
      expect(window.location.hash).toBe('#about');

      router.destroy();
    });
  });

  describe('Safety & Robustness', () => {
    it('should handle malformed URL parameters gracefully', async () => {
      const $target = $('<div id="app-route-err"></div>').appendTo(document.body);
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true; // Enable debug to capture params warning

      const router = $.route({
        target: '#app-route-err',
        default: 'home',
        routes: {
          home: {
            render: (el) => {
              el.innerHTML = '<div>Home</div>';
            },
          },
        },
      });

      // Trigger malformed hash
      window.location.hash = '#home?bad=%FF%FE';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      // Check that target still exists and router is alive
      expect(document.getElementById('app-route-err')).not.toBeNull();
      // Verify warning was logged (implementation does not pass the error object)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Malformed URI component')
      );

      router.destroy();
      $target.remove();
    });

    it('continues navigation even if pushState throws (e.g. file:// restriction)', async () => {
      const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {
        throw new DOMException('SecurityError: The operation is insecure.', 'SecurityError');
      });
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true; // Enable debug logging

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

      // Attempt navigation
      router.navigate('about');
      await $.nextTick();

      // Verify pushState failed but swallowed
      expect(pushStateSpy).toHaveBeenCalled();

      // Verify warning logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('PushState failed'),
        expect.anything()
      );

      // Verify UI updated despite URL error
      expect(router.currentRoute.value).toBe('about');
      expect(document.querySelector('#app')?.innerHTML).toContain('About Page');

      router.destroy();
    });

    it('logs warning if pushState throws (was replaceState)', async () => {
      // restoreUrl now uses pushState to avoid back button traps
      const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {
        throw new Error('Mock Push Failure');
      });
      const warnSpy = vi.spyOn(debug, 'warn');
      debug.enabled = true;

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
          about: {
            template: '#tmpl-about',
            onLeave: () => false, // Will trigger restoreUrl -> pushState
          },
        },
      });

      await $.nextTick();
      router.navigate('about');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');

      // Now try popstate back to home, which should be blocked and trigger replaceState (restoreUrl)
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/home' },
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new window.Event('popstate'));
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about'); // Blocked
      expect(pushStateSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('PushState failed'),
        expect.anything()
      );

      router.destroy();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/', search: '', hash: '' },
        writable: true,
        configurable: true,
      });
    });
  });

  describe('History Mode', () => {
    it('should render default route using pathname', async () => {
      // jsdom defaults pathname to '/' which resolves to defaultRoute
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
      expect(document.querySelector('#app')?.innerHTML).toContain('Home Page');

      router.destroy();
    });

    it('should navigate programmatically with pushState', async () => {
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

      router.navigate('about');
      await $.nextTick();

      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/about');
      expect(router.currentRoute.value).toBe('about');
      expect(document.querySelector('#app')?.innerHTML).toContain('About Page');

      router.destroy();
    });

    it('should handle popstate event', async () => {
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

      // Navigate to about first
      router.navigate('about');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('about');

      // Simulate browser back button: change pathname then fire popstate
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/home', search: '' },
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new window.Event('popstate'));
      await $.nextTick();

      expect(router.currentRoute.value).toBe('home');

      router.destroy();
      // Restore location
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/', search: '', hash: '' },
        writable: true,
        configurable: true,
      });
    });

    it('should apply basePath', async () => {
      const pushStateSpy = vi.spyOn(history, 'pushState');

      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/app/home', search: '' },
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
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      expect(router.currentRoute.value).toBe('home');

      router.navigate('about');
      await $.nextTick();

      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/app/about');
      expect(router.currentRoute.value).toBe('about');

      router.destroy();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/', search: '', hash: '' },
        writable: true,
        configurable: true,
      });
    });

    it('should parse query params from window.location.search', async () => {
      const renderSpy = vi.fn(
        (container: HTMLElement, _route: string, params: Record<string, string>) => {
          container.innerHTML = `ID: ${params.id}`;
        }
      );

      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/detail', search: '?id=99' },
        writable: true,
        configurable: true,
      });

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
          detail: { render: renderSpy },
        },
      });

      await $.nextTick();

      expect(router.currentRoute.value).toBe('detail');
      expect(renderSpy).toHaveBeenCalled();
      const args = renderSpy.mock.calls[0];
      expect(args![2]).toEqual({ id: '99' });

      router.destroy();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/', search: '', hash: '' },
        writable: true,
        configurable: true,
      });
    });

    it('should listen to popstate not hashchange, and cleanup correctly', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const router = $.route({
        target: '#app',
        default: 'home',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
        },
      });

      expect(addSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
      expect(addSpy).not.toHaveBeenCalledWith('hashchange', expect.any(Function));

      router.destroy();

      expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function));

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Dynamic Behavior', () => {
    it('should bind dynamically added [data-route] links', async () => {
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

      // Add link dynamically AFTER init
      const $newLink = $('<a href="#page2" data-route="page2">Page 2</a>').appendTo('#links');

      // Navigate via click (Event Delegation)
      $newLink[0].click();
      await $.nextTick();

      expect(router.currentRoute.value).toBe('page2');
      expect(document.querySelector('#app')?.innerHTML).toContain('Page2');
      expect($newLink.hasClass('active-link')).toBe(true);

      router.destroy();
    });
  });

  describe('queryParams reactive atom', () => {
    it('should start empty and reactively update when hash changes with params', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });

      await $.nextTick();
      expect(router.queryParams.value).toEqual({});

      window.location.hash = '#home?id=42&tab=info';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(router.queryParams.value).toEqual({ id: '42', tab: 'info' });

      router.destroy();
    });

    it('should update when only params change on the same route', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });

      await $.nextTick();

      window.location.hash = '#home?id=1';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(router.queryParams.value).toEqual({ id: '1' });

      window.location.hash = '#home?id=2';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(router.queryParams.value).toEqual({ id: '2' });

      router.destroy();
    });

    it('should be read-only (computed)', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        routes: { home: { template: '#tmpl-home' } },
      });

      await $.nextTick();

      // Attempt to modify the computed queryParams should fail
      expect(() => {
        // @ts-expect-error: property is readonly
        router.queryParams.value = { foo: 'bar' };
      }).toThrow();

      router.destroy();
    });
  });

  describe('Same-route param change: onParamsChange', () => {
    it('should call onParamsChange instead of render when only params change', async () => {
      const renderSpy = vi.fn((el: HTMLElement) => {
        el.innerHTML = '<div>Rendered</div>';
      });
      const onParamsChangeSpy = vi.fn((_params: Record<string, string>) => {});

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: renderSpy,
            onParamsChange: onParamsChangeSpy,
          },
        },
      });

      await $.nextTick();
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Change only params on the same route
      window.location.hash = '#home?id=42';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(renderSpy).toHaveBeenCalledTimes(1); // No additional render
      expect(onParamsChangeSpy).toHaveBeenCalledWith({ id: '42' });

      router.destroy();
    });

    it('should call onParamsChange multiple times for consecutive param changes', async () => {
      const renderSpy = vi.fn((el: HTMLElement) => {
        el.innerHTML = '<div>Rendered</div>';
      });
      const onParamsChangeSpy = vi.fn((_params: Record<string, string>) => {});

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: renderSpy,
            onParamsChange: onParamsChangeSpy,
          },
        },
      });

      await $.nextTick();

      window.location.hash = '#home?page=1';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      window.location.hash = '#home?page=2';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(onParamsChangeSpy).toHaveBeenCalledTimes(2);

      router.destroy();
    });

    it('should call render (not onParamsChange) when navigating to a different route', async () => {
      const homeRenderSpy = vi.fn((el: HTMLElement) => {
        el.innerHTML = 'Home';
      });
      const onParamsChangeSpy = vi.fn((_params: Record<string, string>) => {});

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: homeRenderSpy,
            onParamsChange: onParamsChangeSpy,
          },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();

      router.navigate('about');
      await $.nextTick();

      router.navigate('home');
      await $.nextTick();

      // render called for initial + re-entry = 2 times
      expect(homeRenderSpy).toHaveBeenCalledTimes(2);
      // onParamsChange should NOT have been called (route changed, not just params)
      expect(onParamsChangeSpy).not.toHaveBeenCalled();

      router.destroy();
    });

    it('should NOT call $target.empty() on param-only change (preserve DOM reference)', async () => {
      let capturedEl: HTMLElement | null = null;
      const renderSpy = vi.fn((el: HTMLElement) => {
        const div = document.createElement('div');
        div.id = 'persistent-element';
        div.textContent = 'Keep me';
        el.appendChild(div);
        capturedEl = div;
      });

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            render: renderSpy,
            onParamsChange: (_params: Record<string, string>) => {},
          },
        },
      });

      await $.nextTick();
      expect(capturedEl).not.toBeNull();

      window.location.hash = '#home?v=2';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      // The DOM element created during render should still be present
      expect(document.getElementById('persistent-element')).toBe(capturedEl);

      router.destroy();
    });
  });

  describe('activeLinks single effect', () => {
    it('should create only 1 effect for N links (3 links)', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        autoBindLinks: true,
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
          contact: { template: '#tmpl-contact' },
        },
      });

      await $.nextTick();

      // subscriberCount should be 2: renderEffect + 1 activeLinks effect
      // (not 1 per link)
      expect(router.currentRoute.subscriberCount()).toBe(2);

      router.destroy();
    });
  });

  describe('Template onMount hook', () => {
    it('should call onMount with jQuery object of CONTENT (children) after rendering', async () => {
      const onMountSpy = vi.fn((_$content: JQuery) => {});

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          // tmpl-home has <h1> and <p>, so children should be length 2
          home: {
            template: '#tmpl-home',
            onMount: onMountSpy,
          },
        },
      });

      await $.nextTick();

      expect(onMountSpy).toHaveBeenCalledTimes(1);
      // Should receive a jQuery object
      const arg = onMountSpy.mock.calls[0]![0];
      expect(arg).toBeInstanceOf($);

      // Verify it is the content, not the container
      // The container is #app. The content is <h1> and <p>.
      expect(arg.attr('id')).not.toBe('app');
      expect(arg.length).toBe(2); // h1 + p
      expect(arg.filter('h1').text()).toBe('Home Page');

      router.destroy();
    });

    it('should call onMount again on route re-entry (total 2 times)', async () => {
      const onMountSpy = vi.fn((_$content: JQuery) => {});

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            template: '#tmpl-home',
            onMount: onMountSpy,
          },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      expect(onMountSpy).toHaveBeenCalledTimes(1);

      // Navigate away and back
      router.navigate('about');
      await $.nextTick();
      router.navigate('home');
      await $.nextTick();

      expect(onMountSpy).toHaveBeenCalledTimes(2);

      router.destroy();
    });

    it('should call onMount when content is already connected to DOM', async () => {
      let isConnectedAtCallTime = false;

      const router = $.route({
        target: '#app',
        default: 'home',
        routes: {
          home: {
            template: '#tmpl-home',
            onMount: ($content: JQuery) => {
              // Check that the content is actually in the DOM
              // $content is collection of children, check first one
              isConnectedAtCallTime = $content[0]?.isConnected ?? false;
            },
          },
        },
      });

      await $.nextTick();

      expect(isConnectedAtCallTime).toBe(true);

      router.destroy();
    });
  });
});
