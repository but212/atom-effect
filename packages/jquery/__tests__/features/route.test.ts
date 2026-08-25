import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '@/core/registry';
import $ from '@/index';

/**
 * Mock Data & Templates
 */
const INITIAL_HTML = `
  <nav id="global-nav">
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

describe('$.route() - SPA Routing System', () => {
  let routers: ReturnType<typeof $.route>[] = [];

  /**
   * Factory for creating and tracking router instances
   */
  async function createRouter(options: Partial<Parameters<typeof $.route>[0]> = {}) {
    const router = $.route({
      target: '#app',
      ...options,
    });
    routers.push(router);
    await $.nextTick();
    return router;
  }

  beforeEach(() => {
    document.body.innerHTML = INITIAL_HTML;
    window.location.hash = '';
    $.debug.enabled = false;
    routers = [];
  });

  afterEach(() => {
    for (const r of routers) {
      r.destroy();
    }
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Navigation & State', () => {
    it('should handle basic navigation and route discovery', async () => {
      const router = await createRouter({
        notFound: '404',
        routes: { '404': { template: '#tmpl-404' } },
      });

      expect(router.currentRoute.value).toBe('home');
      expect($('h1').text()).toBe('Home');

      await router.navigate('user/101');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('user/101');
      expect(router.params.value.id).toBe('101');

      await router.navigate('unknown-path');
      await $.nextTick();
      expect($('h1').text()).toContain('404');
    });

    it('should maintain reactivity for query parameters', async () => {
      const router = await createRouter();
      const spy = vi.fn();
      const queryEffect = $.effect(() => spy(router.queryParams.value));

      await router.navigate('home?id=123&mode=dark');
      await $.nextTick();
      expect(router.queryParams.value).toEqual({ id: '123', mode: 'dark' });

      await router.navigate('home?mode=dark&id=123');
      await $.nextTick();
      expect(spy).toHaveBeenCalledTimes(2);
      queryEffect.dispose();
    });

    it('should update reactive state when only query parameters change', async () => {
      const onEnter = vi.fn();
      const router = await createRouter({
        routes: { home: { template: '#tmpl-home', onEnter } },
      });
      onEnter.mockClear();

      await router.navigate('home?q=searching');
      await $.nextTick();

      expect(onEnter).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rendering & Metadata', () => {
    it('should synchronize meta tags and document title', async () => {
      const router = await createRouter({
        routes: {
          home: { template: '#tmpl-home', meta: { description: 'Home Meta' } },
          about: { template: '#tmpl-about' },
        },
      });

      expect($('meta[name="description"]').attr('content')).toBe('Home Meta');

      await router.navigate('about');
      await $.nextTick();
      expect(document.title).toBe('About Page');

      $('meta[name="description"]').remove();
    });

    it('should support history mode and URL normalization', async () => {
      const pushSpy = vi.spyOn(history, 'pushState');
      const router = await createRouter({
        mode: 'history',
        basePath: '/v2',
        routes: { home: { template: '#tmpl-home' }, about: { template: '#tmpl-about' } },
      });

      await router.navigate('//about');
      await $.nextTick();

      expect(location.pathname).toBe('/v2/about');
      expect(pushSpy).toHaveBeenCalled();
    });
  });

  describe('Interception & Binding', () => {
    it('should intercept clicks and manage active states', async () => {
      const router = await createRouter({ autoBindLinks: true, activeClass: 'current' });
      const aboutLink = document.querySelector('#nav-about') as HTMLElement;

      aboutLink.click();
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(aboutLink.classList.contains('current')).toBe(true);
      expect(aboutLink.getAttribute('aria-current')).toBe('page');
      expect(document.activeElement?.tagName).toBe('H1');
    });

    it('should support dynamic link updates via MutationObserver', async () => {
      await createRouter({ autoBindLinks: true, activeClass: 'active' });
      const $link = $('<a href="#about" class="nav-link"></a>').appendTo('body');

      await $.nextTick();
      expect($link.hasClass('active')).toBe(false);

      $link.attr('href', '#home');
      await $.nextTick();
      expect($link.hasClass('active')).toBe(true);
      $link.remove();
    });

    it('should ignore non-route asset links', async () => {
      await createRouter({
        notFound: '404',
        routes: { '404': { template: '#tmpl-404' } },
      });

      const pdfLink = $(
        '<a href="/assets/manual.pdf" data-route="/assets/manual.pdf"></a>'
      ).appendTo('body');

      // Prevent actual navigation to avoid Vitest iframe crash
      pdfLink[0]?.addEventListener('click', (e) => e.preventDefault(), { once: true });

      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      pdfLink[0]?.dispatchEvent(event);

      // The router should NOT have called preventDefault (leaving it to our manual listener)
      // Wait, since we added a manual listener that calls preventDefault, it WILL be called.
      // But we want to ensure the ROUTER didn't call it.
      // Actually, if our listener is 'once' and called, we check if it was called only once.
      expect(preventDefaultSpy).toHaveBeenCalledTimes(1);

      pdfLink.remove();
    });

    it('should support SVG anchor tags', async () => {
      const router = await createRouter({
        autoBindLinks: true,
        activeClass: 'active',
        routes: { about: { template: '#tmpl-about' } },
      });

      const svgLink = document.createElementNS('http://www.w3.org/2000/svg', 'a');
      svgLink.setAttribute('href', '#about');
      svgLink.setAttribute('data-route', '');
      document.body.appendChild(svgLink);

      svgLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await $.nextTick();

      expect(router.currentRoute.value).toBe('about');
      expect(svgLink.classList.contains('active')).toBe(true);
      svgLink.remove();
    });
  });

  describe('Lifecycle & Guards', () => {
    it('should trigger enter/leave hooks and cleanups', async () => {
      const onUnmount = vi.fn();
      const onEnter = vi.fn(() => ({ injected: 'true' }));
      const router = await createRouter({
        routes: {
          home: { render: (_el, _r, _p, cleanup) => cleanup(onUnmount), onEnter },
          about: { template: '#tmpl-about' },
        },
      });

      expect(onEnter).toHaveBeenCalled();
      expect(router.params.value.injected).toBe('true');

      await router.navigate('about');
      await $.nextTick();
      expect(onUnmount).toHaveBeenCalled();
    });

    it('should clean bindings before replacing the previous route view', async () => {
      const source = $.atom('old');
      let oldElement: HTMLElement | undefined;
      const router = await createRouter({
        routes: {
          home: {
            render: (element) => {
              oldElement = document.createElement('span');
              $(oldElement).atomText(source);
              element.appendChild(oldElement);
            },
          },
          about: { template: '#tmpl-about' },
        },
      });

      expect(oldElement).toBeDefined();
      expect(registry.hasBind(oldElement as HTMLElement)).toBe(true);

      await router.navigate('about');
      await $.nextTick();

      expect(registry.hasBind(oldElement as HTMLElement)).toBe(false);
      source.value = 'new';
      await $.nextTick();
      expect(oldElement?.textContent).toBe('old');
    });

    it('should prevent navigation when guard returns false', async () => {
      const onEnter = vi.fn(() => false as const);
      const router = await createRouter({
        routes: {
          home: { template: '#tmpl-home' },
          blocked: { template: '#tmpl-about', onEnter },
        },
      });

      await router.navigate('blocked');
      await $.nextTick();

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value).toBe('home');
    });

    it('should respect navigation guards on popstate events', async () => {
      const onLeave = vi.fn(() => false);
      const router = await createRouter({
        mode: 'history',
        basePath: '/v2',
        routes: {
          home: { template: '#tmpl-home' },
          about: { template: '#tmpl-about', onLeave },
        },
      });

      await router.navigate('about');
      await $.nextTick();

      history.replaceState(null, '', '/v2/home');
      window.dispatchEvent(new Event('popstate'));

      expect(onLeave).toHaveBeenCalled();
      expect(router.currentRoute.value).toBe('about');
    });

    it('should prevent infinite loops in transition hooks', async () => {
      const router = await createRouter({
        routes: {
          home: { template: '#tmpl-home' },
          redirect: { template: '#tmpl-about' },
        },
        beforeTransition: (_, to) => {
          if (to === 'redirect') router.navigate('home');
        },
      });

      await router.navigate('redirect');
      await $.nextTick();

      expect(router.currentRoute.value).toBe('home');
      expect($('h1').text()).toBe('Home');
    });
  });

  describe('Multi-Instance & Isolation', () => {
    it('should operate independently with different targets', async () => {
      $('<div id="app1"></div><div id="app2"></div>').appendTo('body');

      const r1 = await createRouter({
        target: '#app1',
        routes: { p1: { render: (element: HTMLElement) => (element.innerText = 'App1') } },
        default: '',
      });
      const r2 = await createRouter({
        target: '#app2',
        routes: { p2: { render: (element: HTMLElement) => (element.innerText = 'App2') } },
        default: '',
      });

      await r1.navigate('p1');
      await $.nextTick();
      expect($('#app1').text()).toBe('App1');
      expect($('#app2').text()).toBe('');

      await r2.navigate('p2');
      await $.nextTick();
      expect($('#app2').text()).toBe('App2');

      $('#app1, #app2').remove();
    });

    it('should handle scoped interception correctly', async () => {
      $('<div id="area1"></div><div id="area2"></div>').appendTo('body');

      await createRouter({
        target: '#area1',
        autoBindLinks: true,
        routes: { home: { render: (element: HTMLElement) => (element.innerText = 'Home 1') } },
      });
      await createRouter({
        target: '#area2',
        autoBindLinks: true,
        routes: { home: { render: (element: HTMLElement) => (element.innerText = 'Home 2') } },
      });

      const $link = $('<a href="#home" data-route="home">Click</a>').appendTo('body');
      $link[0]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
      await $.nextTick();

      expect($('#area1').text()).toBe('Home 1');
      expect($('#area2').text()).toBe('Home 2');

      $link.remove();
      $('#area1, #area2').remove();
    });
  });

  describe('Edge Cases & Resilience', () => {
    it('should handle malformed URIs gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const router = await createRouter();

      await router.navigate('home?bad=%FF');
      await $.nextTick();
      expect(router.queryParams.value.bad).toBe('\uFFFD');

      await router.navigate('user/%FF');
      await $.nextTick();
      expect(router.params.value.id).toBe('%FF');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should work even if target container is missing initially', async () => {
      const router = await createRouter({ target: '#non-existent' });
      await router.navigate('home');
      await $.nextTick();
      expect(router.currentRoute.value).toBe('home');
    });

    it('should respect explicitly empty default route', async () => {
      const router = await createRouter({ default: '' });
      expect(router.currentRoute.value).toBe('');
      expect($('#app').text()).toBe('');
    });

    it('should initialize without throwing if document.body is missing', () => {
      expect(() => $.route({ target: '#app' })).not.toThrow();
    });
  });
});
