import { afterEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Web Components Synergy (useAtomComponent)', () => {
  const createdElements: HTMLElement[] = [];

  // Automated cleanup to ensure test isolation
  afterEach(() => {
    while (createdElements.length > 0) {
      const el = createdElements.pop();
      el?.remove();
    }
    vi.restoreAllMocks();
  });

  /** Helper to define a unique custom element for a test case */
  const defineTestComponent = (ctor: CustomElementConstructor) => {
    const tagName = `test-comp-${Math.random().toString(36).slice(2, 9)}`;
    customElements.define(tagName, ctor);
    return tagName;
  };

  /** Helper to render a component into the DOM and track it for cleanup */
  const renderTestComponent = (tagName: string, attrs: Record<string, string> = {}) => {
    const $el = $(document.createElement(tagName));
    for (const [key, val] of Object.entries(attrs)) $el.attr(key, val);
    $el.appendTo(document.body);
    createdElements.push($el[0]!);
    return $el;
  };

  it('should re-fetch data automatically when component attributes change', async () => {
    const ajaxSpy = vi.spyOn($, 'ajax').mockImplementation((settings?: JQuery.AjaxSettings) => {
      const id = settings?.url?.split('/').pop();
      const deferred = $.Deferred();
      deferred.resolve({ id, name: `User ${id}` });
      return deferred.promise() as JQuery.jqXHR;
    });

    const tagName = defineTestComponent(
      class extends HTMLElement {
        private aej = $.useAtomComponent(this);
        private setupDone = false;

        connectedCallback() {
          if (this.setupDone) return;
          this.setupDone = true;

          const userId = this.aej.attrs('user-id');
          const userData = $.atomFetch<{ name: string }>(() => `/api/users/${userId.value}`, {
            defaultValue: { name: 'Loading...' },
            eager: true,
          });

          this.aej.setup({
            bind: { name: $.computed(() => userData.value.name) },
          });
          this.innerHTML = '<span id="user-name" data-aej-bind="name"></span>';
        }

        disconnectedCallback() {
          this.aej.teardown();
        }
      }
    );

    const $el = renderTestComponent(tagName, { 'user-id': '1' });

    // 1. Initial Load
    await vi.waitFor(() => expect($el.find('#user-name').text()).toBe('User 1'));
    expect(ajaxSpy).toHaveBeenCalled();
    ajaxSpy.mockClear();

    // 2. Reactive Update
    $el.attr('user-id', '2');
    await vi.waitFor(() => expect($el.find('#user-name').text()).toBe('User 2'));
    expect(ajaxSpy).toHaveBeenCalledTimes(1);
  });

  it('should synchronize encapsulated form data within Shadow DOM', async () => {
    const userAtom = $.atom({
      profile: { name: 'John', settings: { theme: 'light' } },
    });

    const tagName = defineTestComponent(
      class extends HTMLElement {
        private aej = $.useAtomComponent(this);
        connectedCallback() {
          const root = this.attachShadow({ mode: 'open' });
          root.innerHTML = `
            <form id="user-form">
              <input name="profile.name" id="name-input" />
              <input name="profile.settings.theme" id="theme-input" />
            </form>
          `;
          $(root.querySelector('#user-form') as HTMLFormElement).atomForm(userAtom);
          this.aej.setup(root);
        }
        disconnectedCallback() {
          this.aej.teardown();
        }
      }
    );

    const $el = renderTestComponent(tagName);
    await $.nextTick();

    const shadow = $el[0]!.shadowRoot!;
    const nameInput = shadow.querySelector('#name-input') as HTMLInputElement;
    const themeInput = shadow.querySelector('#theme-input') as HTMLInputElement;

    // Verify initial sync
    expect($(nameInput).val()).toBe('John');

    // UI -> Atom
    $(nameInput).val('Jane').trigger('input');
    await $.nextTick();
    expect(userAtom.value.profile.name).toBe('Jane');

    // Atom -> UI (Deep path)
    userAtom.value = {
      ...userAtom.value,
      profile: { ...userAtom.value.profile, settings: { theme: 'dark' } },
    };
    await $.nextTick();
    expect($(themeInput).val()).toBe('dark');
  });

  it('should handle high-performance list rendering and cleanup', async () => {
    const listData = $.atom([
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2' },
    ]);
    let renderCount = 0;

    const tagName = defineTestComponent(
      class extends HTMLElement {
        private aej = $.useAtomComponent(this);
        connectedCallback() {
          $('<ul id="list-container"></ul>')
            .appendTo(this)
            .atomList(listData, {
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
    );

    const $el = renderTestComponent(tagName);
    await $.nextTick();

    expect($el.find('li').length).toBe(2);
    expect(renderCount).toBe(2);

    // Verify Cleanup
    $el.remove();
    await new Promise((r) => setTimeout(r, 50)); // Wait for registry cleanup

    listData.value = [...listData.value, { id: 3, text: 'Item 3' }];
    await $.nextTick();
    expect(renderCount).toBe(2); // Should not increase after removal
  });

  describe('Diagnostics', () => {
    it('should warn when used on an unregistered custom element', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      $.debug.enabled = true;

      const tagName = `unregistered-${Math.random().toString(36).slice(2, 9)}`;
      $.useAtomComponent(document.createElement(tagName));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[atom-component] Custom Element <${tagName}> is not registered.`)
      );
    });
  });
});
