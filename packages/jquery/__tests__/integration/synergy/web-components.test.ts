import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Web Components Synergy (useAtomComponent)', () => {
  it('should re-fetch data automatically when component attributes change via useAtomComponent', async () => {
    const ajaxSpy = vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
      const url = settings?.url || '';
      const id = url.split('/').pop();
      const deferred = $.Deferred();
      deferred.resolve({ id, name: `User ${id}` });
      return deferred.promise() as JQuery.jqXHR;
    });

    class UserProfile extends HTMLElement {
      private aej = $.useAtomComponent(this);

      connectedCallback() {
        const userId = this.aej.attrs('user-id');
        const userData = $.atomFetch<{ name: string }>(() => `/api/users/${userId.value}`, {
          defaultValue: { name: 'Loading...' },
          eager: true,
        });

        this.aej.setup({
          bind: {
            name: $.computed(() => userData.value.name),
          },
        });

        this.innerHTML = '<span id="user-name" data-aej-bind="name"></span>';
      }

      disconnectedCallback() {
        this.aej.teardown();
      }
    }

    if (!customElements.get('user-profile')) {
      customElements.define('user-profile', UserProfile);
    }

    const $el = $('<user-profile user-id="1"></user-profile>').appendTo(document.body);

    await vi.waitFor(() => {
      if ($el.find('#user-name').text() === 'User 1') return;
      throw new Error('Waiting for User 1');
    });

    expect($el.find('#user-name').text()).toBe('User 1');
    expect(ajaxSpy).toHaveBeenCalledTimes(1);

    // Update attribute -> should trigger re-fetch
    $el.attr('user-id', '2');

    await vi.waitFor(() => {
      if ($el.find('#user-name').text() === 'User 2') return;
      throw new Error('Waiting for User 2');
    });

    expect($el.find('#user-name').text()).toBe('User 2');
    expect(ajaxSpy).toHaveBeenCalledTimes(2);

    $el.remove();
    ajaxSpy.mockRestore();
  });

  it('should synchronize encapsulated deep-path form data within Shadow DOM using atomForm', async () => {
    const userAtom = $.atom({
      profile: {
        name: 'John',
        settings: { theme: 'light' },
      },
    });

    class DeepUserForm extends HTMLElement {
      private aej = $.useAtomComponent(this);

      connectedCallback() {
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <form id="user-form">
            <input name="profile.name" id="name-input" />
            <input name="profile.settings.theme" id="theme-input" />
          </form>
        `;

        const form = root.querySelector('#user-form') as HTMLFormElement;
        $(form).atomForm(userAtom);

        this.aej.setup(root);
      }

      disconnectedCallback() {
        this.aej.teardown();
      }
    }

    const tagName = `deep-user-form-${Math.random().toString(36).slice(2, 9)}`;
    customElements.define(tagName, DeepUserForm);

    const $el = $(`<${tagName}></${tagName}>`).appendTo(document.body);
    await $.nextTick();

    const shadow = $el[0]?.shadowRoot;
    if (!shadow) throw new Error('Shadow root not found');

    const nameInput = shadow.querySelector('#name-input') as HTMLInputElement;
    const themeInput = shadow.querySelector('#theme-input') as HTMLInputElement;

    await $.nextTick();
    expect($(nameInput).val()).toBe('John');

    // UI -> Atom
    $(nameInput).val('Jane').trigger('input');
    await $.nextTick();
    expect(userAtom.value.profile.name).toBe('Jane');

    // Atom -> UI (Deep)
    userAtom.value = {
      ...userAtom.value,
      profile: {
        ...userAtom.value.profile,
        settings: { theme: 'dark' },
      },
    };
    await $.nextTick();
    expect($(themeInput).val()).toBe('dark');

    $el.remove();
  });

  it('should perform high-performance list rendering and automated cleanup in web components', async () => {
    const listData = $.atom([
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
    ]);

    let renderCount = 0;

    class ReactiveList extends HTMLElement {
      private aej = $.useAtomComponent(this);

      connectedCallback() {
        const $ul = $('<ul id="list-container"></ul>').appendTo(this);

        $ul.atomList(listData, {
          key: 'id',
          render: (item: { id: number; text: string }) => {
            renderCount++;
            return `<li id="item-${item.id}">${item.text}</li>`;
          },
        });

        this.aej.setup();
      }

      disconnectedCallback() {
        this.aej.teardown();
      }
    }

    const tagName = `reactive-list-${Math.random().toString(36).slice(2, 9)}`;
    customElements.define(tagName, ReactiveList);

    const $el = $(`<${tagName}></${tagName}>`).appendTo(document.body);
    await $.nextTick();

    expect($el.find('li').length).toBe(2);
    expect(renderCount).toBe(2);

    $el.remove();
    await new Promise((resolve) => setTimeout(resolve, 50));

    listData.value = [...listData.value, { id: 3, text: 'Item 3' }];
    await $.nextTick();

    // renderCount should remain 2 because of cleanup
    expect(renderCount).toBe(2);
  });

  describe('Diagnostics & Warnings', () => {
    it('should warn when useAtomComponent is called on an unregistered custom element', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      $.debug.enabled = true;

      const tagName = `unregistered-test-${Math.random().toString(36).slice(2, 9)}`;
      const el = document.createElement(tagName);

      // Trigger the warning by calling useAtomComponent on an unregistered tag
      $.useAtomComponent(el);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[atom-component] Custom Element <${tagName}> is not registered.`)
      );

      warnSpy.mockRestore();
    });
  });
});
