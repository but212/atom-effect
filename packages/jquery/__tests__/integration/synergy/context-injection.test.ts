import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import type { Router } from '@/types';
import { setupDOMCleanup } from '../../utils/test-helpers';

describe('Context Injection Synergy (provide/inject)', () => {
  const { appendToBody } = setupDOMCleanup();
  it('should inject and share global router state with nested child components using provideAtom', async () => {
    const $app = appendToBody('<div id="route-app"><div id="router-view"></div></div>');

    const tagName = `route-child-${Math.random().toString(36).slice(2, 9)}`;

    const router = $.route({
      target: $app.find('#router-view'),
      mode: 'hash',
      routes: {
        '/': { render: (el) => $(el).html(`<${tagName}></${tagName}>`) },
        '/page/:id': { render: (el) => $(el).html(`<${tagName}></${tagName}>`) },
      },
    });

    $.provideAtom($app, 'global-router', router);

    class RouteChild extends HTMLElement {
      aej = $.useAtomComponent(this);

      connectedCallback() {
        const r = this.aej.injectAtom<Router>('global-router');

        this.aej.setup({
          bind: {
            path: $.computed(() => r?.value?.currentRoute.value || ''),
            id: $.computed(() => r?.value?.params.value.id || 'none'),
          },
        });

        this.innerHTML = `
          <span id="current-path" data-aej-bind="path"></span>
          <span id="current-id" data-aej-bind="id"></span>
        `;
      }

      disconnectedCallback() {
        this.aej.teardown();
      }
    }

    customElements.define(tagName, RouteChild);

    // Initial route
    router.navigate('/');
    await $.nextTick();
    expect($app.find('#current-path').text()).toBe('');

    // Dynamic route
    router.navigate('/page/456');
    await $.nextTick();
    expect($app.find('#current-path').text()).toBe('page/456');
    expect($app.find('#current-id').text()).toBe('456');

    router.destroy();
    $app.remove();
  });

  it('should synchronize reactive state with CSS variables via provideAtom (CSS Bridge)', async () => {
    const themeAtom = $.atom('dark');
    const accentAtom = $.atom('#ff0000');

    const $container = appendToBody('<div id="theme-container"></div>');

    $.provideAtom($container, 'theme', themeAtom);
    $.provideAtom($container, 'accent-color', accentAtom);

    await $.nextTick();

    // Check CSS variables on the host element
    const style = $container[0]?.style;
    expect(style?.getPropertyValue('--aej-theme')).toBe('dark');
    expect(style?.getPropertyValue('--aej-accent-color')).toBe('#ff0000');

    // Update atoms
    themeAtom.value = 'light';
    accentAtom.value = '#00ff00';
    await $.nextTick();

    expect(style?.getPropertyValue('--aej-theme')).toBe('light');
    expect(style?.getPropertyValue('--aej-accent-color')).toBe('#00ff00');

    $container.remove();
  });

  it('should warn when injectAtom is called on an unregistered custom element', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    $.debug.enabled = true;

    const tagName = `unregistered-inject-${Math.random().toString(36).slice(2, 9)}`;
    const el = document.createElement(tagName);

    $.injectAtom(el, 'some-key');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[atom-component] Custom Element <${tagName}> is not registered.`)
    );

    warnSpy.mockRestore();
  });
});
