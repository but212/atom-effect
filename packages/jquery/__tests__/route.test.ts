import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index';

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
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
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
    it('should clean up listeners and bound links on destroy', async () => {
      const router = $.route({
        target: '#app',
        default: 'home',
        autoBindLinks: true,
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about' },
        },
      });

      const homeLink = document.querySelector('[data-route="home"]') as HTMLElement;
      expect(homeLink.classList.contains('_aes-bound')).toBe(true);

      router.destroy();

      // Links unbinding
      expect(homeLink.classList.contains('_aes-bound')).toBe(false);

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

  describe('Safety & Robustness', () => {
    it('should handle malformed URL parameters gracefully', async () => {
      const $target = $('<div id="app-route-err"></div>').appendTo(document.body);

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

      const warnSpy = vi.spyOn(console, 'warn');

      // Trigger malformed hash
      window.location.hash = '#home?bad=%FF%FE';
      window.dispatchEvent(new window.Event('hashchange'));
      await $.nextTick();

      // Check that target still exists and router is alive
      expect(document.getElementById('app-route-err')).not.toBeNull();
      // Verify warning was logged
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Malformed URI component'));

      router.destroy();
      $target.remove();
      warnSpy.mockRestore();
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
});
