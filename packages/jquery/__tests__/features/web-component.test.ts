import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HYDRATION_MARKER } from '@/core/symbols';
import $ from '@/index';
import type { AtomComponentElement } from '@/types';

// ─── Test Utilities ─────────────────────────────────────────────────────────

/** Defines a unique custom element and returns an instance. */
function defineAndCreate<T extends HTMLElement>(
  tagPrefix: string,
  klass: new () => T
): AtomComponentElement<T> {
  const name = `${tagPrefix}-${Math.random().toString(36).slice(2, 7)}`;
  customElements.define(name, klass);
  const el = document.createElement(name) as T;
  const aej = $.useAtomComponent(el);
  return Object.assign(el, { aej }) as AtomComponentElement<T>;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Web Component Features', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Core Lifecycle & Management', () => {
    it('should maintain controller singleton and handle clean teardown', () => {
      const el = document.createElement('div');
      const ctrl1 = $.useAtomComponent(el);
      const ctrl2 = $.useAtomComponent(el);

      expect(ctrl1).toBe(ctrl2);

      const sr = el.attachShadow({ mode: 'open' });
      ctrl1.setup(sr);
      expect(ctrl1.root).toBe(sr);

      ctrl1.teardown();
      expect(ctrl1.root).toBeNull();
    });

    it('should prevent re-initialization with conflicting roots', () => {
      const el = document.createElement('div');
      const ctrl = $.useAtomComponent(el);
      ctrl.setup(el.attachShadow({ mode: 'open' }));

      const conflict = document.createElement('div') as unknown as ShadowRoot;
      expect(() => ctrl.setup(conflict)).toThrow(/teardown/i);
    });
  });

  describe('Reactive Dependency Injection (DI)', () => {
    it('should resolve atoms through DOM hierarchy with live updates', async () => {
      const provider = document.createElement('div');
      const consumer = document.createElement('div');
      const atom = $.atom('initial');

      $.provideAtom(provider, 'key', atom);
      provider.appendChild(consumer);

      const injected = $.injectAtom(consumer, 'key');
      expect(injected?.value).toBe('initial');

      atom.value = 'updated';
      expect(injected?.value).toBe('updated');

      injected!.value = 'modified';
      expect(atom.value).toBe('modified');
    });

    it('should handle "Hybrid Discovery" during node movement (Critical Case)', async () => {
      const providerA = document.createElement('div');
      const providerB = document.createElement('div');
      const consumer = document.createElement('div');

      $.provideAtom(providerA, 'ctx', 'ValueA');
      $.provideAtom(providerB, 'ctx', 'ValueB');

      providerA.appendChild(consumer);
      const injected = $.injectAtom(consumer, 'ctx');
      expect(injected?.value).toBe('ValueA');

      // Detached move
      providerB.appendChild(consumer);
      expect(injected?.value).toBe('ValueB');
    });

    it('should cleanup provider effects and injection proxies on teardown', async () => {
      const p = document.createElement('div');
      const c = document.createElement('div');
      p.appendChild(c);

      const ctrl = $.useAtomComponent(p);
      ctrl.provideAtom('k', 'v1');

      const injected = $.injectAtom(c, 'k');
      expect(injected?.value).toBe('v1');

      ctrl.teardown();
      await $.nextTick();
      expect(injected?.value).toBeNull();
    });
  });

  describe('Attribute & Slot Synchronization', () => {
    it('should sync observedAttributes to reactive atoms', async () => {
      const el = defineAndCreate(
        'attr-sync',
        class extends HTMLElement {
          static observedAttributes = ['active'];
        }
      );

      el.setAttribute('active', 'yes');
      document.body.appendChild(el);
      el.aej.setup();

      expect(el.aej.attrs('active').value).toBe('yes');

      el.setAttribute('active', 'no');
      await vi.waitFor(() => expect(el.aej.attrs('active').value).toBe('no'));
    });

    it('should track assigned nodes in slots reactively', async () => {
      const el = defineAndCreate(
        'slot-sync',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<slot></slot>';
            $.useAtomComponent(this).setup(sr);
          }
        }
      );
      document.body.appendChild(el);

      const slots = el.aej.slots;
      expect(slots('default').value.length).toBe(0);

      const child = document.createElement('span');
      el.appendChild(child);
      await $.nextTick();
      expect(slots('default').value[0]).toBe(child);
    });

    it('should track assigned nodes when slots is accessed before setup is called (late-bound)', async () => {
      const el = defineAndCreate(
        'slot-late-sync',
        class extends HTMLElement {
          connectedCallback() {
            const slots = $.useAtomComponent(this).slots;
            expect(slots('default').value.length).toBe(0);

            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<slot></slot>';
            $.useAtomComponent(this).setup(sr);
          }
        }
      );
      document.body.appendChild(el);

      const child = document.createElement('span');
      el.appendChild(child);
      await $.nextTick();
      expect(el.aej.slots('default').value[0]).toBe(child);
    });

    it('should support closed shadow roots if provided to setup', async () => {
      const el = defineAndCreate(
        'closed-sr',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'closed' });
            sr.innerHTML = '<slot></slot>';
            $.useAtomComponent(this).setup(sr);
          }
        }
      );
      document.body.appendChild(el);

      const child = document.createElement('span');
      el.appendChild(child);
      await $.nextTick();
      expect(el.aej.slots('default').value[0]).toBe(child);
    });
  });

  describe('Declarative Features (Hydration & Styles)', () => {
    it('should hydrate elements via data-aej-bind', async () => {
      const name = $.atom('Alice');
      const el = defineAndCreate(
        'bind-feat',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<span data-aej-bind="user"></span>';
            $.useAtomComponent(this).setup({ shadowRoot: sr, bind: { user: name } });
          }
        }
      );
      document.body.appendChild(el);

      const span = el.shadowRoot!.querySelector('span');
      expect(span?.textContent).toBe('Alice');

      name.value = 'Bob';
      await $.nextTick();
      expect(span?.textContent).toBe('Bob');
    });

    it('should share CSSStyleSheet instances across components', () => {
      const css = ':host { display: block; }';
      const el1 = defineAndCreate(
        'style-share',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            $.useAtomComponent(this).setup({ shadowRoot: sr, styles: [css] });
          }
        }
      );

      const el2 = defineAndCreate(
        'style-share-2',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            $.useAtomComponent(this).setup({ shadowRoot: sr, styles: [css] });
          }
        }
      );

      document.body.appendChild(el1);
      document.body.appendChild(el2);

      const sheets1 = el1.shadowRoot!.adoptedStyleSheets;
      const sheets2 = el2.shadowRoot!.adoptedStyleSheets;

      expect(sheets1[0]).toBe(sheets2[0]); // Reference equality
    });

    it('should mark elements with HYDRATION_MARKER when bound', async () => {
      const name = $.atom('test');
      const el = defineAndCreate(
        'marker-comp',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<span data-aej-bind="user"></span>';
            $.useAtomComponent(this).setup({ shadowRoot: sr, bind: { user: name } });
          }
        }
      );
      document.body.appendChild(el);

      const span = el.shadowRoot!.querySelector('span') as HTMLElement & {
        [HYDRATION_MARKER]?: boolean;
      };
      expect(span[HYDRATION_MARKER]).toBe(true);
    });
  });

  describe('Advanced Synergy (A11y & Dispatch)', () => {
    it('should bind atoms to AriaMixin properties', async () => {
      const expanded = $.atom(false);
      const el = defineAndCreate(
        'aria-feat',
        class extends HTMLElement {
          connectedCallback() {
            $.useAtomComponent(this).setup({ aria: { ariaExpanded: expanded } });
          }
        }
      );
      document.body.appendChild(el);

      const internals = el.aej.internals!;
      expect(internals.ariaExpanded).toBe('false');

      expanded.value = true;
      await $.nextTick();
      expect(internals.ariaExpanded).toBe('true');
    });

    it('should dispatch custom events reactively', async () => {
      const count = $.atom(0);
      const spy = vi.fn();
      const el = defineAndCreate(
        'dispatch-feat',
        class extends HTMLElement {
          connectedCallback() {
            $.useAtomComponent(this).setup({ dispatch: { update: count } });
          }
        }
      );

      el.addEventListener('update', (e: Event) => spy((e as CustomEvent).detail.value));
      document.body.appendChild(el);

      count.value = 10;
      await $.nextTick();
      expect(spy).toHaveBeenCalledWith(10);
    });

    it('should bind CSS Parts reactively', async () => {
      const active = $.atom(true);
      const el = defineAndCreate(
        'part-feat',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<div data-aej-part="box"></div>';
            $.useAtomComponent(this).setup({
              shadowRoot: sr,
              parts: { box: $.computed(() => ({ active: active.value })) },
            });
          }
        }
      );
      document.body.appendChild(el);

      const div = el.shadowRoot!.querySelector('div')!;
      expect(div.getAttribute('part')).toBe('active');

      active.value = false;
      await $.nextTick();
      expect(div.getAttribute('part')).toBe('');
    });
  });

  describe('Form-Associated Custom Elements (FACE)', () => {
    it('should synchronize atom value with native form submission', async () => {
      const nameAtom = $.atom('initial_value');
      const el = defineAndCreate(
        'face-sync',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({ value: nameAtom });
          }
        }
      );
      el.setAttribute('name', 'username');

      const form = document.createElement('form');
      form.appendChild(el);
      document.body.appendChild(form);

      const formData = new FormData(form);
      expect(formData.get('username')).toBe('initial_value');

      nameAtom.value = 'updated_value';
      await $.nextTick();

      const formData2 = new FormData(form);
      expect(formData2.get('username')).toBe('updated_value');
    });

    it('should support complex values via FormData conversion', async () => {
      const formAtom = $.atom({ first: 'John', last: 'Doe' });
      const el = defineAndCreate(
        'face-complex',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({ value: formAtom });
          }
        }
      );
      el.setAttribute('name', 'user');

      const form = document.createElement('form');
      form.appendChild(el);
      document.body.appendChild(form);

      const formData = new FormData(form);
      expect(formData.get('user[first]')).toBe('John');
      expect(formData.get('user[last]')).toBe('Doe');

      formAtom.value = { first: 'Jane', last: 'Smith' };
      await $.nextTick();

      const formData2 = new FormData(form);
      expect(formData2.get('user[first]')).toBe('Jane');
      expect(formData2.get('user[last]')).toBe('Smith');
    });

    it('should support dual-atom synchronization for value and state', async () => {
      const val = $.atom('v1');
      const state = $.atom('s1');
      const el = defineAndCreate(
        'face-dual',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({ value: { val, state } });
          }
        }
      );
      el.setAttribute('name', 'test');

      const form = document.createElement('form');
      form.appendChild(el);
      document.body.appendChild(form);

      // Value check
      expect(new FormData(form).get('test')).toBe('v1');

      val.value = 'v2';
      await $.nextTick();
      expect(new FormData(form).get('test')).toBe('v2');
    });

    it('should integrate with reactive validation atoms (computed)', async () => {
      const email = $.atom('invalid');
      const errorAtom = $.computed(() => {
        return email.value.includes('@') ? '' : 'Invalid email format';
      });

      const el = defineAndCreate(
        'face-valid-atom',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({
              value: email,
              validation: errorAtom,
            });
          }
        }
      );

      const form = document.createElement('form');
      form.appendChild(el);
      document.body.appendChild(form);

      expect(form.checkValidity()).toBe(false);
      expect(el.aej.internals?.validationMessage).toBe('Invalid email format');

      email.value = 'user@example.com';
      await $.nextTick();

      expect(form.checkValidity()).toBe(true);
      expect(el.aej.internals?.validationMessage).toBe('');
    });

    it('should handle native validation logic via callback', async () => {
      const val = $.atom('');
      const el = defineAndCreate(
        'face-valid-cb',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({
              value: val,
              validation: (v: string) => (v ? '' : 'Required field'),
            });
          }
        }
      );

      const form = document.createElement('form');
      form.appendChild(el);
      document.body.appendChild(form);

      expect(form.checkValidity()).toBe(false);

      val.value = 'content';
      await $.nextTick();
      expect(form.checkValidity()).toBe(true);
    });
  });

  describe('Declarative Static Specs', () => {
    it('should automatically apply static aejStyles', async () => {
      const css = ':host { display: block; color: red; }';
      const el = defineAndCreate(
        'static-styles',
        class extends HTMLElement {
          static aejStyles = [css];
          connectedCallback() {
            this.attachShadow({ mode: 'open' });
          }
        }
      );
      document.body.appendChild(el);
      await $.nextTick();

      const sheets = el.shadowRoot!.adoptedStyleSheets;
      expect(sheets.length).toBeGreaterThan(0);
      expect(sheets[0]?.cssRules[0]?.cssText).toContain('color: red');
    });

    it('should automatically bind static aejBind', async () => {
      const name = $.atom('Alice');
      const el = defineAndCreate(
        'static-bind',
        class extends HTMLElement {
          static aejBind = { user: name };
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<span data-aej-bind="user"></span>';
          }
        }
      );
      document.body.appendChild(el);
      await $.nextTick();

      const span = el.shadowRoot!.querySelector('span');
      expect(span?.textContent).toBe('Alice');

      name.value = 'Bob';
      await $.nextTick();
      expect(span?.textContent).toBe('Bob');
    });

    it('should automatically sync static aejAria', async () => {
      const expanded = $.atom(false);
      const el = defineAndCreate(
        'static-aria',
        class extends HTMLElement {
          static aejAria = { ariaExpanded: expanded };
        }
      );
      document.body.appendChild(el);
      await $.nextTick();

      const internals = el.aej.internals!;
      expect(internals.ariaExpanded).toBe('false');

      expanded.value = true;
      await $.nextTick();
      expect(internals.ariaExpanded).toBe('true');
    });

    it('should automatically sync static aejParts', async () => {
      const active = $.atom(true);
      const el = defineAndCreate(
        'static-parts',
        class extends HTMLElement {
          static aejParts = { box: $.computed(() => ({ active: active.value })) };
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<div data-aej-part="box"></div>';
          }
        }
      );
      document.body.appendChild(el);
      await $.nextTick();

      const div = el.shadowRoot!.querySelector('div')!;
      expect(div.getAttribute('part')).toBe('active');

      active.value = false;
      await $.nextTick();
      expect(div.getAttribute('part')).toBe('');
    });

    it('should automatically handle static aejDispatch', async () => {
      const count = $.atom(0);
      const spy = vi.fn();
      const el = defineAndCreate(
        'static-dispatch',
        class extends HTMLElement {
          static aejDispatch = { update: count };
        }
      );

      el.addEventListener('update', (e: Event) => spy((e as CustomEvent).detail.value));
      document.body.appendChild(el);
      await $.nextTick();

      count.value = 100;
      await $.nextTick();
      expect(spy).toHaveBeenCalledWith(100);
    });

    it('should automatically handle static aejValue & aejValidation (FACE)', async () => {
      const val = $.atom('initial');
      const el = defineAndCreate(
        'static-face',
        class extends HTMLElement {
          static formAssociated = true;
          static aejValue = val;
          static aejValidation = (v: string) => (v.length > 3 ? '' : 'too short');
        }
      );
      el.setAttribute('name', 'test');
      const form = document.createElement('form');
      form.appendChild(el);
      document.body.appendChild(form);
      await $.nextTick();

      expect(new FormData(form).get('test')).toBe('initial');
      expect(form.checkValidity()).toBe(true);

      val.value = 'abc';
      await $.nextTick();
      expect(form.checkValidity()).toBe(false);
      expect(el.aej.internals?.validationMessage).toBe('too short');
    });
  });
});
