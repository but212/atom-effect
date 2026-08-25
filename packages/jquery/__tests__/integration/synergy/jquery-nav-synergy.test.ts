import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import type { AtomNav } from '@/types';
import { createMockJqXHR, setupDOMCleanup } from '../../utils/test-helpers';

/**
 * Utility to setup AJAX mocks for PJAX/Navigation tests
 */
function setupMockAjax(responses: Record<string, string | { html: string; url?: string }>) {
  return vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
    const url = settings?.url || '';
    const response = Object.entries(responses).find(([pattern]) => url.includes(pattern))?.[1];

    const xhr = createMockJqXHR(Promise.resolve(), {
      getResponseHeader: (name: string) => {
        if (name === 'X-PJAX-URL') {
          return typeof response === 'object' ? response.url || url : url;
        }
        return null;
      },
      abort: vi.fn(),
      status: 200,
      statusText: 'OK',
    });

    const deferred = $.Deferred<unknown, unknown, unknown>();

    if (response) {
      const html = typeof response === 'object' ? response.html : response;
      deferred.resolve(html, 'success', xhr);
      return Object.assign(deferred.promise(), xhr);
    }

    return $.Deferred<unknown, unknown, unknown>().reject(xhr).promise() as JQuery.jqXHR;
  });
}

describe('Form & Navigation Synergy (Security & Regression)', () => {
  let activeManagers: { destroy: () => void }[] = [];
  let $app!: JQuery;

  const track = <T extends { destroy: () => void }>(manager: T): T => {
    activeManagers.push(manager);
    return manager;
  };

  const { appendToBody } = setupDOMCleanup();
  beforeEach(() => {
    document.body.innerHTML = '';
    activeManagers = [];
    $app = appendToBody('<div id="app"></div>');
    $.initAEJ({ autoCleanup: true });
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    for (const manager of activeManagers) {
      manager.destroy();
    }
    $.initAEJ({ autoCleanup: false });
  });

  describe('Regression: Form Tag Neutralization', () => {
    it('should neutralize <form> elements during PJAX navigation', async () => {
      setupMockAjax({
        home: '<div>Home Page</div>',
        'form-page': `
          <div id="form-container">
            <form id="test-form">
              <input type="text" name="user.firstName" value="Initial" />
              <input type="checkbox" name="preferences.notify" />
            </form>
          </div>
        `,
      });

      const nav = track($.atomNav({ target: $app }));
      await nav.navigate('/home');
      await vi.waitFor(() => expect($app.text()).toContain('Home Page'));

      await nav.navigate('/form-page');
      await vi.waitFor(() => expect($app.find('#test-form').length).toBe(1));

      const $form = $app.find('#test-form');
      expect($form[0]).not.toBeInstanceOf(HTMLFormElement);
      expect($form[0]?.tagName).toBe('SPAN');
      expect($form.find('input').length).toBe(2);
      expect($form.find('input[name="user.firstName"]').val()).toBe('Initial');
    });
  });

  describe('Security & Sanitization on Navigation', () => {
    let nav!: AtomNav;

    beforeEach(() => {
      nav = track($.atomNav({ target: $app }));
    });

    it('should scrub malicious URL sinks (action, formaction) on form tags during navigation', async () => {
      setupMockAjax({
        evil: `
          <div id="evil-container">
            <form id="evil-form" action="javascript:alert('action')" formaction="javascript:alert('formaction')">
              <input type="submit" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/evil');

      await vi.waitFor(() => expect($app.find('#evil-form').length).toBe(1));

      const $form = $app.find('#evil-form');
      expect($form.attr('action')).toBe('data-unsafe-protocol:');
      expect($form.attr('formaction')).toBe('data-unsafe-protocol:');
    });

    it('should preserve safe action and formaction URLs during navigation', async () => {
      setupMockAjax({
        safe: `
          <div id="safe-container">
            <form id="safe-form" action="/submit-form?id=123#step1" formaction="relative/path/to/endpoint">
              <input type="submit" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/safe');

      await vi.waitFor(() => expect($app.find('#safe-form').length).toBe(1));

      const $form = $app.find('#safe-form');
      expect($form.attr('action')).toBe('/submit-form?id=123#step1');
      expect($form.attr('formaction')).toBe('relative/path/to/endpoint');
    });

    it('should scrub active event handlers (e.g. onclick, onsubmit) on form tags during navigation', async () => {
      setupMockAjax({
        click: `
          <div id="click-container">
            <form id="click-form" onclick="alert('click')" onsubmit="return false;">
              <input type="text" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/click');

      await vi.waitFor(() => expect($app.find('#click-form').length).toBe(1));

      const $form = $app.find('#click-form');
      expect($form.attr('onclick')).toBeUndefined();
      expect($form.attr('onsubmit')).toBeUndefined();
      expect($form.attr('data-unsafe-attr')).toBe('onclick,onsubmit');
    });

    it('should recursively neutralize scripts inside a nested form tag while neutralizing the form', async () => {
      setupMockAjax({
        scripted: `
          <div id="nested">
            <form id="nested-form">
              <script>console.log('injected')</script>
              <input type="text" name="foo" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/scripted');

      await vi.waitFor(() => expect($app.find('#nested-form').length).toBe(1));

      const $form = $app.find('#nested-form');
      expect($form[0]).not.toBeInstanceOf(HTMLFormElement);
      expect($form[0]?.tagName).toBe('SPAN');
      expect($form.find('script').length).toBe(0);
      expect($form.find('span').length).toBe(1); // Script neutralized to span
    });

    it('should scrub dangerous attributes on input elements inside forms during navigation', async () => {
      setupMockAjax({
        inputs: `
          <div id="inputs-container">
            <form id="inputs-form">
              <input type="submit" id="sub-btn" formaction="javascript:evil()" onclick="evil()" />
              <input type="image" id="img-btn" src="javascript:evil()" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/inputs');

      await vi.waitFor(() => expect($app.find('#inputs-form').length).toBe(1));

      const $submit = $app.find('#sub-btn');
      expect($submit.attr('formaction')).toBe('data-unsafe-protocol:');
      expect($submit.attr('onclick')).toBeUndefined();
      expect($submit.attr('data-unsafe-attr')).toBe('onclick');

      const $image = $app.find('#img-btn');
      expect($image.attr('src')).toBe('data-unsafe-protocol:');
    });

    it('should scrub DOM-clobbering name/id values on elements inside forms', async () => {
      setupMockAjax({
        clobber: `
          <div id="clobber-container">
            <form id="clobber-form">
              <input name="innerHTML" id="clobbered-input-name" />
              <input id="attributes" class="clobbered-input-id" />
              <input name="safeName" id="safeId" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/clobber');

      await vi.waitFor(() => expect($app.find('#clobber-form').length).toBe(1));

      const $input1 = $app.find('#clobbered-input-name');
      expect($input1.attr('name')).toBeUndefined();

      const $input2 = $app.find('.clobbered-input-id');
      expect($input2.attr('id')).toBeUndefined();

      const $safe = $app.find('#safeId');
      expect($safe.attr('name')).toBe('safeName');
    });

    it('should block dangerous CSS inside <style> tags nested in forms', async () => {
      setupMockAjax({
        styles: `
          <div id="styles-container">
            <form id="styles-form">
              <style>
                body { background: url(javascript:evil()); }
              </style>
              <input type="text" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/styles');

      await vi.waitFor(() => expect($app.find('#styles-form').length).toBe(1));
      const $styleSpan = $app.find('#styles-form span');
      expect($styleSpan.text()).toBe('/* blocked */');
    });

    it('should neutralize blacklisted structural tags (e.g. iframe and form) to spans', async () => {
      setupMockAjax({
        structural: `
          <div id="struct">
            <iframe src="http://evil.com"></iframe>
            <form id="struct-form"></form>
          </div>
        `,
      });

      await nav.navigate('/structural');

      await vi.waitFor(() => expect($app.find('#struct-form').length).toBe(1));

      const $iframe = $app.find('iframe');
      expect($iframe.length).toBe(0); // iframe should be stripped / neutralized

      const $span = $app.find('span');
      expect($span.length).toBe(2); // iframe and form turned into spans
    });

    it('should neutralize malicious tags encoded within text nodes inside forms', async () => {
      setupMockAjax({
        textNode: `
          <div id="text-container">
            <form id="text-form">
              This is a text node with &lt;script&gt;alert('xss')&lt;/script&gt; inside.
            </form>
          </div>
        `,
      });

      await nav.navigate('/textNode');

      await vi.waitFor(() => expect($app.find('#text-form').length).toBe(1));
      const $form = $app.find('#text-form');
      expect($form.text()).toContain("[script]alert('xss')[/script]");
      expect($form.find('script').length).toBe(0);
    });

    it('should neutralize blacklisted structural tags (e.g. iframe, object) nested inside forms', async () => {
      setupMockAjax({
        nestedStruct: `
          <div id="nested-struct-container">
            <form id="nested-struct-form">
              <iframe src="javascript:evil()"></iframe>
              <object data="javascript:evil()"></object>
            </form>
          </div>
        `,
      });

      await nav.navigate('/nestedStruct');

      await vi.waitFor(() => expect($app.find('#nested-struct-form').length).toBe(1));
      const $form = $app.find('#nested-struct-form');
      expect($form.find('iframe').length).toBe(0);
      expect($form.find('object').length).toBe(0);
      expect($form.find('span').length).toBe(2); // iframe and object turned into spans
    });

    it('should block obfuscated JavaScript protocols in form action/formaction attributes', async () => {
      setupMockAjax({
        obfuscated: `
          <div id="obf-container">
            <form id="obf-form" action="ja&Tab;vascript:alert(1)" formaction="jav&#x0D;ascript:alert(2)">
              <input type="submit" />
            </form>
          </div>
        `,
      });

      await nav.navigate('/obfuscated');

      await vi.waitFor(() => expect($app.find('#obf-form').length).toBe(1));
      const $form = $app.find('#obf-form');
      expect($form.attr('action')).toBe('data-unsafe-protocol:');
      expect($form.attr('formaction')).toBe('data-unsafe-protocol:');
    });

    it('should block SVG/SMIL injection inside forms during navigation', async () => {
      setupMockAjax({
        svg: `
          <div id="svg-container">
            <form id="svg-form">
              <svg>
                <animate attributeName="href" values="javascript:alert(1)" />
              </svg>
            </form>
          </div>
        `,
      });

      await nav.navigate('/svg');

      await vi.waitFor(() => expect($app.find('#svg-form').length).toBe(1));
      const $animate = $app.find('animate');
      expect($animate.attr('values')).toBeUndefined();
    });
  });

  describe('Fetch & Navigation Synergy', () => {
    it('should abort pending atomFetch requests when a component containing it is unmounted by navigation', async () => {
      let fetchAborted = false;

      // Single unified spy to prevent mock overriding collisions
      vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
        const url = settings?.url || '';
        const xhr = createMockJqXHR(Promise.resolve(), {
          getResponseHeader: () => null,
          abort: () => {
            if (url.includes('/api')) {
              fetchAborted = true;
            }
          },
          status: 200,
          statusText: 'OK',
        });

        const deferred = $.Deferred<unknown, unknown, unknown>();

        if (url.includes('home')) {
          deferred.resolve('<div id="comp">Home</div>', 'success', xhr);
        } else if (url.includes('other')) {
          deferred.resolve('<div>Other</div>', 'success', xhr);
        }
        // If /api, do not resolve it immediately (pending state)

        return Object.assign(deferred.promise(), xhr);
      });

      const nav = track($.atomNav({ target: $app }));
      await nav.navigate('/home');
      await vi.waitFor(() => expect($app.find('#comp').length).toBe(1));

      const fetchAtom = $.atomFetch('/api', { eager: true, defaultValue: null });
      $app.find('#comp').atomMount(($element) => {
        $element.atomText(fetchAtom);
        return () => {
          fetchAtom.dispose(); // User cleans up fetch atom on unmount
        };
      });

      await $.nextTick();

      expect(fetchAborted).toBe(false);

      await nav.navigate('/other');
      await vi.waitFor(() => expect($app.text()).toContain('Other'));
      expect(fetchAborted).toBe(true);
    });
  });

  describe('List & Navigation Synergy', () => {
    it('should cleanly dispose list bindings and item effects when navigating away', async () => {
      setupMockAjax({
        listPage: `
          <div id="list-container">
            <ul id="items-list"></ul>
          </div>
        `,
        otherPage: '<div>Other Page</div>',
      });

      const itemsAtom = $.atom([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]);
      const nav = track($.atomNav({ target: $app }));

      await nav.navigate('/listPage');
      await vi.waitFor(() => expect($app.find('#items-list').length).toBe(1));

      const $list = $app.find('#items-list');
      $list.atomList(itemsAtom, {
        key: 'id',
        render: (item) => `<li class="list-item">${item.name}</li>`,
        bind: ($element, item) => {
          $element.atomText($.computed(() => item.name));
        },
      });

      // Verify rendered and bound
      expect($app.find('.list-item').length).toBe(2);
      const firstItemEl = $app.find('.list-item')[0];
      const listEl = $list[0];
      if (!firstItemEl || !listEl) throw new Error('Expected list elements to be defined');
      expect(firstItemEl.textContent).toBe('Item 1');

      // Navigate away
      await nav.navigate('/otherPage');
      await vi.waitFor(() => expect($app.text()).toContain('Other Page'));

      // Update the items array
      itemsAtom.value = [
        { id: 1, name: 'Item 1 Updated' },
        { id: 2, name: 'Item 2 Updated' },
      ];
      await $.nextTick();

      // Check that the detached element was NOT updated (bindings cleaned up)
      expect(firstItemEl.textContent).toBe('Item 1');
    });

    it('should mount and render an atomList correctly when navigating to a new page', async () => {
      setupMockAjax({
        home: '<div>Home</div>',
        listPage: `
          <div id="list-container">
            <ul id="items-list"></ul>
          </div>
        `,
      });

      const itemsAtom = $.atom([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ]);
      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($container, url) => {
            if (url.includes('listPage')) {
              $container.find('#items-list').atomList(itemsAtom, {
                key: 'id',
                render: (item) => `<li class="list-item">${item.name}</li>`,
              });
            }
          },
        })
      );

      await nav.navigate('/home');
      await nav.navigate('/listPage');

      await vi.waitFor(() => expect($app.find('.list-item').length).toBe(2));
      expect($app.find('.list-item').eq(0).text()).toBe('A');
      expect($app.find('.list-item').eq(1).text()).toBe('B');
    });
  });

  describe('Web Components & Navigation Synergy', () => {
    class SynergyComponent extends HTMLElement {
      private aej = $.useAtomComponent(this);
      public textAtom = $.atom('initial-value');

      connectedCallback() {
        this.innerHTML = '<span data-aej-bind="text"></span>';
        this.aej.setup({
          bind: {
            text: this.textAtom,
          },
        });
      }
    }

    let customElementDefined = false;

    beforeEach(() => {
      if (!customElementDefined) {
        customElements.define('synergy-component', SynergyComponent);
        customElementDefined = true;
      }
    });

    it('should initialize, update, and teardown custom elements correctly through navigation cycles', async () => {
      setupMockAjax({
        compPage: `
          <div id="comp-wrapper">
            <synergy-component id="my-comp"></synergy-component>
          </div>
        `,
        otherPage: '<div>Other Page</div>',
      });

      const nav = track($.atomNav({ target: $app }));

      // Navigate to page with component
      await nav.navigate('/compPage');
      await vi.waitFor(() => expect($app.find('synergy-component').length).toBe(1));

      const $comp = $app.find('synergy-component');
      const compEl = $comp[0] as SynergyComponent;
      if (!compEl) throw new Error('Expected custom element to be defined');

      expect($comp.find('span').text()).toBe('initial-value');

      // Verify updating text while mounted works
      compEl.textAtom.value = 'updated-value';
      await $.nextTick();
      expect($comp.find('span').text()).toBe('updated-value');

      // Navigate away
      await nav.navigate('/otherPage');
      await vi.waitFor(() => expect($app.text()).toContain('Other Page'));

      // Verify component was torn down and updates to atom no longer propagate
      compEl.textAtom.value = 'stale-value';
      await $.nextTick();
      expect($comp.find('span').text()).toBe('updated-value');
    });
  });

  describe('atomMount & Navigation Synergy', () => {
    it('should trigger mount and cleanup callbacks of atomMount on PJAX navigation cycles', async () => {
      setupMockAjax({
        mountPage: `
          <div id="mount-wrapper">
            <div id="mount-element">Initial</div>
          </div>
        `,
        otherPage: '<div>Other Page</div>',
      });

      let mountCalled = 0;
      let cleanupCalled = 0;

      const nav = track(
        $.atomNav({
          target: $app,
          onMount: ($container, url) => {
            if (url.includes('mountPage')) {
              $container.find('#mount-element').atomMount(($element) => {
                mountCalled++;
                $element.text('Mounted');
                return () => {
                  cleanupCalled++;
                };
              });
            }
          },
        })
      );

      // Navigate to mount page
      await nav.navigate('/mountPage');
      await vi.waitFor(() => expect($app.find('#mount-element').text()).toBe('Mounted'));
      expect(mountCalled).toBe(1);
      expect(cleanupCalled).toBe(0);

      // Navigate away
      await nav.navigate('/otherPage');
      await vi.waitFor(() => expect($app.text()).toContain('Other Page'));

      expect(mountCalled).toBe(1);
      expect(cleanupCalled).toBe(1);
    });
  });
});
