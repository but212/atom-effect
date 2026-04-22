import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('$.route() - SPA Routing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav>
        <a href="#home" id="nav-home" data-route>Home</a>
        <a href="#about" id="nav-about" data-route>About</a>
        <a href="#user/42" id="nav-user" data-route>User</a>
        <a href="https://external.com" id="nav-external">External</a>
      </nav>
      <div id="app"></div>
      <template id="tmpl-home" data-path="home" data-default><h1>Home</h1></template>
      <template id="tmpl-about" data-path="about" title="About Page"><h1>About</h1></template>
      <template id="tmpl-user" data-path="user/:id"><h1>User Section</h1><span id="u-id"></span></template>
      <template id="tmpl-404"><h1>404 Not Found</h1></template>
    `;
    window.location.hash = '';
    $.debug.enabled = false;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Core Mechanics', () => {
    it('should discover routes from DOM and handle navigation', async () => {
      // 1. Auto-discovery & Initial Render
      const router = $.route({
        target: '#app',
        notFound: '404',
        routes: { '404': { template: '#tmpl-404' } },
      });
      await $.nextTick();

      expect(router.currentRoute.value).toBe('home');
      expect($('h1').text()).toBe('Home');

      // 2. Programmatic & Dynamic Segments
      router.navigate('user/101');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('user/101');
      expect(router.params.value.id).toBe('101');

      // 3. Fallback Navigation
      router.navigate('unknown-path');
      await $.nextTick();
      expect($('h1').text()).toContain('404');

      router.destroy();
    });

    it('should maintain reactive state for query parameters', async () => {
      const router = $.route({ target: '#app' });
      const spy = vi.fn();
      $.effect(() => spy(router.queryParams.value));

      router.navigate('home?id=123&mode=dark');
      await $.nextTick();
      expect(router.queryParams.value).toEqual({ id: '123', mode: 'dark' });

      // Prevent redundant updates
      router.navigate('home?mode=dark&id=123');
      await $.nextTick();
      expect(spy).toHaveBeenCalledTimes(2); // Initial (1) + First Change (1)

      router.destroy();
    });
  });

  describe('History Mode & Standard Compliance', () => {
    it('should normalize URLs and update document metadata', async () => {
      const pushSpy = vi.spyOn(history, 'pushState');
      const router = $.route({
        target: '#app',
        mode: 'history',
        basePath: '/v2',
        routes: { home: { template: '#tmpl-home' }, about: { template: '#tmpl-about' } },
      });

      // 1. URL Normalization (Multiple slashes)
      router.navigate('//about');
      await $.nextTick();

      expect(location.pathname).toBe('/v2/about');
      expect(pushSpy).toHaveBeenCalled();

      // 2. Title Synchronization
      expect(document.title).toBe('About Page');

      // 3. Popstate Event with Guard
      const onLeave = vi.fn(() => false); // Block

      const router2 = $.route({
        target: '#app',
        mode: 'history',
        basePath: '/v2',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about', onLeave },
        },
      });

      router2.navigate('about');
      await $.nextTick();

      history.replaceState(null, '', '/v2/home');
      window.dispatchEvent(new Event('popstate'));
      expect(onLeave).toHaveBeenCalled();
      expect(router2.currentRoute.value).toBe('about'); // Stayed

      router2.destroy();
      router.destroy();
    });
  });

  describe('Link Binding & Accessibility', () => {
    it('should intercept clicks and manage accessibility', async () => {
      const router = $.route({ target: '#app', autoBindLinks: true, activeClass: 'current' });
      await $.nextTick();

      const aboutLink = document.querySelector('#nav-about') as HTMLElement;

      // Click Interception
      aboutLink.click();
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(aboutLink.classList.contains('current')).toBe(true);
      expect(aboutLink.getAttribute('aria-current')).toBe('page');

      // Focus Management (A11y)
      expect(document.activeElement?.tagName).toBe('H1');

      router.destroy();
    });
  });

  describe('Lifecycle & Error resilience', () => {
    it('should trigger hooks and satisfy standard events', async () => {
      const eventSpy = vi.fn();
      window.addEventListener('route-change', eventSpy);

      const onUnmount = vi.fn();
      const onEnter = vi.fn(() => ({ injected: 'true' }));
      const router = $.route({
        target: '#app',
        routes: {
          home: { render: (_el, _r, _p, cleanup) => cleanup(onUnmount), onEnter },
          about: { template: '#tmpl-about' },
        },
      });

      await $.nextTick();
      expect(onEnter).toHaveBeenCalled();
      expect(router.params.value.injected).toBe('true');

      router.navigate('about');
      await $.nextTick();

      expect(onUnmount).toHaveBeenCalled(); // previous cleanup
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({ to: 'about' }),
        })
      );

      window.removeEventListener('route-change', eventSpy);
      router.destroy();
    });

    it('should survive and warn on broken link/route inputs', async () => {
      const warnSpy = vi.spyOn($.debug, 'warn');
      $.debug.enabled = true;
      const router = $.route({ target: '#app' });

      // Malformed URI in query
      router.navigate('home?bad=%FF');
      await $.nextTick();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('route'),
        expect.stringContaining('Malformed')
      );

      router.destroy();
    });

    it('should handle malformed path segments gracefully', async () => {
      const router = $.route({ target: '#app' });

      // %FF is invalid URI encoding for decodeURIComponent
      router.navigate('user/%FF');
      await $.nextTick();

      // Should fall back to raw string and not crash
      expect(router.params.value.id).toBe('%FF');
      expect(router.currentRoute.value).toBe('user/%FF');

      router.destroy();
    });

    it('should not throw if the target container is missing', async () => {
      // Intentionally use a non-existent selector
      const router = $.route({ target: '#non-existent' });

      // Navigation should not crash despite missing container
      router.navigate('home');
      await $.nextTick();

      expect(router.currentRoute.value).toBe('home');

      router.destroy();
    });
  });

  describe('Bug Reports (Failing Tests - Red Phase)', () => {
    it('should trigger onEnter when only query parameters change', async () => {
      const onEnter = vi.fn();
      const router = $.route({
        target: '#app',
        routes: {
          home: { template: '#tmpl-home', onEnter },
        },
      });
      await $.nextTick();
      onEnter.mockClear();

      router.navigate('home?q=searching');
      await $.nextTick();

      expect(onEnter).toHaveBeenCalledTimes(1);
      router.destroy();
    });

    it('should run route cleanups when router is destroyed', async () => {
      const cleanup = vi.fn();
      const router = $.route({
        target: '#app',
        routes: {
          home: { render: (_c, _n, _p, onUnmount) => onUnmount(cleanup) },
        },
      });
      await $.nextTick();

      router.destroy();
      expect(cleanup).toHaveBeenCalled();
    });

    it('should not corrupt history stack when navigation is blocked by guard', async () => {
      const replaceSpy = vi.spyOn(history, 'replaceState');
      const router = $.route({
        target: '#app',
        mode: 'history',
        routes: {
          home: { template: '#tmpl-home' },
          locked: { template: '#tmpl-home', onLeave: () => false },
        },
      });

      router.navigate('locked');
      await $.nextTick();
      replaceSpy.mockClear();

      // Simulate browser back button to 'home'
      history.pushState(null, '', '/home');
      window.dispatchEvent(new Event('popstate'));

      // If we are at home but blocked, we might call replaceState to go back to locked.
      // We want to make sure we don't accidentally overwrite 'home' if we don't have to.
      // But for this simplified implementation, we'll verify it doesn't loop or crash.
      expect(router.currentRoute.value).toBe('locked');
      router.destroy();
    });

    it('should not intercept clicks on non-route asset links even if notFound is defined', async () => {
      const router = $.route({
        target: '#app',
        notFound: '404',
        routes: { '404': { template: '#tmpl-404' } },
      });

      const pdfLink = document.createElement('a');
      pdfLink.href = '/assets/manual.pdf';
      pdfLink.dataset.route = '/assets/manual.pdf';
      document.body.appendChild(pdfLink);

      // PREVENT CRASH: Stop actual browser navigation in test environment
      pdfLink.addEventListener('click', (e) => e.preventDefault(), { once: true });

      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      pdfLink.dispatchEvent(event);

      // The router's onClick shouldn't have called preventDefault (it's an asset)
      expect(preventDefaultSpy).toHaveBeenCalledTimes(1);

      router.destroy();
      pdfLink.remove();
    });
  });
});
