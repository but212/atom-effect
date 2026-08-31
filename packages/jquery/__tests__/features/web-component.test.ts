import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HYDRATION_MARKER } from '@/core/symbols';
import $ from '@/index';
import type { AtomComponentElement } from '@/types';
import { castTo, setupDOMCleanup } from '../utils/test-helpers';

// ─── Test Utilities ─────────────────────────────────────────────────────────

/** Defines a unique custom element and returns an instance. */
function defineAndCreate<T extends HTMLElement>(
  tagPrefix: string,
  klass: new () => T
): AtomComponentElement<T> {
  const name = `${tagPrefix}-${Math.random().toString(36).slice(2, 7)}`;
  customElements.define(name, klass);
  const element = document.createElement(name);
  const aej = $.useAtomComponent(element);
  return Object.assign(element, { aej }) as AtomComponentElement<T>;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Web Component Features', () => {
  const { appendToBody } = setupDOMCleanup();

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Core Lifecycle & Management', () => {
    it('should maintain controller singleton and handle clean teardown', () => {
      const element = document.createElement('div');
      const ctrl1 = $.useAtomComponent(element);
      const ctrl2 = $.useAtomComponent(element);

      expect(ctrl1).toBe(ctrl2);

      const sr = element.attachShadow({ mode: 'open' });
      ctrl1.setup(sr);
      expect(ctrl1.root).toBe(sr);

      ctrl1.teardown();
      expect(ctrl1.root).toBeNull();
    });

    it('should prevent re-initialization with conflicting roots', () => {
      const element = document.createElement('div');
      const ctrl = $.useAtomComponent(element);
      ctrl.setup(element.attachShadow({ mode: 'open' }));

      const conflict = castTo<ShadowRoot>(document.createElement('div'));
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

      if (injected) {
        injected.value = 'modified';
      }
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
      const parentElement = document.createElement('div');
      const childElement = document.createElement('div');
      parentElement.appendChild(childElement);

      const ctrl = $.useAtomComponent(parentElement);
      ctrl.provideAtom('k', 'v1');

      const injected = $.injectAtom(childElement, 'k');
      expect(injected?.value).toBe('v1');

      ctrl.teardown();
      await $.nextTick();
      expect(injected?.value).toBeNull();
    });
  });

  describe('Attribute & Slot Synchronization', () => {
    it('should sync observedAttributes to reactive atoms', async () => {
      const element = defineAndCreate(
        'attr-sync',
        class extends HTMLElement {
          static observedAttributes = ['active'];
        }
      );

      element.setAttribute('active', 'yes');
      appendToBody(element);
      element.aej.setup();

      expect(element.aej.attrs('active').value).toBe('yes');

      element.setAttribute('active', 'no');
      await vi.waitFor(() => expect(element.aej.attrs('active').value).toBe('no'));
    });

    it('should track assigned nodes in slots reactively', async () => {
      const element = defineAndCreate(
        'slot-sync',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<slot></slot>';
            $.useAtomComponent(this).setup(sr);
          }
        }
      );
      appendToBody(element);

      const slots = element.aej.slots;
      expect(slots('default').value.length).toBe(0);

      const child = document.createElement('span');
      element.appendChild(child);
      await $.nextTick();
      expect(slots('default').value[0]).toBe(child);
    });

    it('should track assigned nodes when slots is accessed before setup is called (late-bound)', async () => {
      const element = defineAndCreate(
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
      appendToBody(element);

      const child = document.createElement('span');
      element.appendChild(child);
      await $.nextTick();
      expect(element.aej.slots('default').value[0]).toBe(child);
    });

    it('should support closed shadow roots if provided to setup', async () => {
      const element = defineAndCreate(
        'closed-sr',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'closed' });
            sr.innerHTML = '<slot></slot>';
            $.useAtomComponent(this).setup(sr);
          }
        }
      );
      appendToBody(element);

      const child = document.createElement('span');
      element.appendChild(child);
      await $.nextTick();
      expect(element.aej.slots('default').value[0]).toBe(child);
    });

    it('should track closed-root slots when slots is accessed before setup', async () => {
      const child = document.createElement('span');
      const captured = { slot: null as { readonly value: Node[] } | null };
      const element = defineAndCreate(
        'closed-sr-late',
        class extends HTMLElement {
          connectedCallback() {
            const controller = $.useAtomComponent(this);
            const slots = controller.slots;
            const slot = slots('default');
            captured.slot = slot;
            expect(slot.value.length).toBe(0);

            const shadowRoot = this.attachShadow({ mode: 'closed' });
            shadowRoot.innerHTML = '<slot></slot>';
            controller.setup(shadowRoot);
          }
        }
      );
      element.appendChild(child);
      appendToBody(element);

      await $.nextTick();
      if (!captured.slot) throw new Error('Expected slot lens to be captured before setup');
      expect(captured.slot.value[0]).toBe(child);
    });

    it('should handle slot access safely after teardown when slotsAtom is disposed', () => {
      const element = document.createElement('div');
      const ctrl = $.useAtomComponent(element);
      const slotAtom = ctrl.slots('default');

      expect(slotAtom.value).toEqual([]);

      ctrl.teardown();

      expect(() => slotAtom.value).not.toThrow();
      expect(slotAtom.value).toEqual([]);
    });
  });

  describe('Declarative Features (Hydration & Styles)', () => {
    it('should hydrate elements via data-aej-bind', async () => {
      const name = $.atom('Alice');
      const element = defineAndCreate(
        'bind-feat',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<span data-aej-bind="user"></span>';
            $.useAtomComponent(this).setup({ shadowRoot: sr, bind: { user: name } });
          }
        }
      );
      appendToBody(element);

      const span = element.shadowRoot?.querySelector('span');
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

      appendToBody(el1);
      appendToBody(el2);

      const sheets1 = el1.shadowRoot?.adoptedStyleSheets;
      const sheets2 = el2.shadowRoot?.adoptedStyleSheets;

      if (sheets1 && sheets2) expect(sheets1[0]).toBe(sheets2[0]); // Reference equality
    });

    it('should mark elements with HYDRATION_MARKER when bound', async () => {
      const name = $.atom('test');
      const element = defineAndCreate(
        'marker-comp',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<span data-aej-bind="user"></span>';
            $.useAtomComponent(this).setup({ shadowRoot: sr, bind: { user: name } });
          }
        }
      );
      appendToBody(element);

      const span = element.shadowRoot?.querySelector('span') as HTMLElement & {
        [HYDRATION_MARKER]?: boolean;
      };
      expect(span[HYDRATION_MARKER]).toBe(true);
    });
  });

  describe('Advanced Synergy (A11y & Dispatch)', () => {
    it('should bind atoms to AriaMixin properties', async () => {
      const expanded = $.atom(false);
      const element = defineAndCreate(
        'aria-feat',
        class extends HTMLElement {
          connectedCallback() {
            $.useAtomComponent(this).setup({ aria: { ariaExpanded: expanded } });
          }
        }
      );
      appendToBody(element);

      const internals = element.aej.internals;
      if (!internals) throw new Error('Expected internals to be defined');
      expect(internals.ariaExpanded).toBe('false');

      expanded.value = true;
      await $.nextTick();
      expect(internals.ariaExpanded).toBe('true');
    });

    it('should dispatch custom events reactively', async () => {
      const count = $.atom(0);
      const spy = vi.fn();
      const element = defineAndCreate(
        'dispatch-feat',
        class extends HTMLElement {
          connectedCallback() {
            $.useAtomComponent(this).setup({ dispatch: { update: count } });
          }
        }
      );

      element.addEventListener('update', (e: Event) => spy((e as CustomEvent).detail.value));
      appendToBody(element);

      count.value = 10;
      await $.nextTick();
      expect(spy).toHaveBeenCalledWith(10);
    });

    it('should bind CSS Parts reactively', async () => {
      const active = $.atom(true);
      const element = defineAndCreate(
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
      appendToBody(element);

      const div = element.shadowRoot?.querySelector('div');
      if (!div) throw new Error('Expected div to exist in shadowRoot');
      expect(div.getAttribute('part')).toBe('active');

      active.value = false;
      await $.nextTick();
      expect(div.getAttribute('part')).toBe('');
    });
  });

  describe('Form-Associated Custom Elements (FACE)', () => {
    it('should synchronize atom value with native form submission', async () => {
      const nameAtom = $.atom('initial_value');
      const element = defineAndCreate(
        'face-sync',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({ value: nameAtom });
          }
        }
      );
      element.setAttribute('name', 'username');

      const form = document.createElement('form');
      form.appendChild(element);
      appendToBody(form);

      const formData = new FormData(form);
      expect(formData.get('username')).toBe('initial_value');

      nameAtom.value = 'updated_value';
      await $.nextTick();

      const formData2 = new FormData(form);
      expect(formData2.get('username')).toBe('updated_value');
    });

    it('should support complex values via FormData conversion', async () => {
      const formAtom = $.atom({ first: 'John', last: 'Doe' });
      const element = defineAndCreate(
        'face-complex',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({ value: formAtom });
          }
        }
      );
      element.setAttribute('name', 'user');

      const form = document.createElement('form');
      form.appendChild(element);
      appendToBody(form);

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
      const value = $.atom('v1');
      const state = $.atom('s1');
      const element = defineAndCreate(
        'face-dual',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({ val: { value, state } });
          }
        }
      );
      element.setAttribute('name', 'test');

      const form = document.createElement('form');
      form.appendChild(element);
      appendToBody(form);

      // Value check
      expect(new FormData(form).get('test')).toBe('v1');

      value.value = 'v2';
      await $.nextTick();
      expect(new FormData(form).get('test')).toBe('v2');
    });

    it('should integrate with reactive validation atoms (computed)', async () => {
      const email = $.atom('invalid');
      const errorAtom = $.computed(() => {
        return email.value.includes('@') ? '' : 'Invalid email format';
      });

      const element = defineAndCreate(
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
      form.appendChild(element);
      appendToBody(form);

      expect(form.checkValidity()).toBe(false);
      expect(element.aej.internals?.validationMessage).toBe('Invalid email format');

      email.value = 'user@example.com';
      await $.nextTick();

      expect(form.checkValidity()).toBe(true);
      expect(element.aej.internals?.validationMessage).toBe('');
    });

    it('should handle native validation logic via callback', async () => {
      const value = $.atom('');
      const element = defineAndCreate(
        'face-valid-cb',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({
              value: value,
              validation: (v: unknown) => (v ? '' : 'Required field'),
            });
          }
        }
      );

      const form = document.createElement('form');
      form.appendChild(element);
      appendToBody(form);

      expect(form.checkValidity()).toBe(false);

      value.value = 'content';
      await $.nextTick();
      expect(form.checkValidity()).toBe(true);
    });
  });

  describe('Declarative Static Specs', () => {
    it('should automatically apply static aejStyles', async () => {
      const css = ':host { display: block; color: red; }';
      const element = defineAndCreate(
        'static-styles',
        class extends HTMLElement {
          static aejStyles = [css];
          aej = $.useAtomComponent(this);
          connectedCallback() {
            this.attachShadow({ mode: 'open' });
            this.aej.setup();
          }
        }
      );
      appendToBody(element);
      await $.nextTick();

      const sheets = element.shadowRoot?.adoptedStyleSheets;
      if (!sheets) throw new Error('Expected adoptedStyleSheets to exist');
      expect(sheets.length).toBeGreaterThan(0);
      expect(sheets[0]?.cssRules[0]?.cssText).toContain('color: red');
    });

    it('should automatically bind static aejBind', async () => {
      const name = $.atom('Alice');
      const element = defineAndCreate(
        'static-bind',
        class extends HTMLElement {
          static aejBind = { user: name };
          aej = $.useAtomComponent(this);
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<span data-aej-bind="user"></span>';
            this.aej.setup();
          }
        }
      );
      appendToBody(element);
      await $.nextTick();

      const span = element.shadowRoot?.querySelector('span');
      expect(span?.textContent).toBe('Alice');

      name.value = 'Bob';
      await $.nextTick();
      expect(span?.textContent).toBe('Bob');
    });

    it('should automatically sync static aejAria', async () => {
      const expanded = $.atom(false);
      const element = defineAndCreate(
        'static-aria',
        class extends HTMLElement {
          static aejAria = { ariaExpanded: expanded };
          aej = $.useAtomComponent(this);
          connectedCallback() {
            this.aej.setup();
          }
        }
      );
      appendToBody(element);
      await $.nextTick();

      const internals = element.aej.internals;
      if (!internals) throw new Error('Expected internals to be defined');
      expect(internals.ariaExpanded).toBe('false');

      expanded.value = true;
      await $.nextTick();
      expect(internals.ariaExpanded).toBe('true');
    });

    it('should automatically sync static aejParts', async () => {
      const active = $.atom(true);
      const element = defineAndCreate(
        'static-parts',
        class extends HTMLElement {
          static aejParts = { box: $.computed(() => ({ active: active.value })) };
          aej = $.useAtomComponent(this);
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<div data-aej-part="box"></div>';
            this.aej.setup();
          }
        }
      );
      appendToBody(element);
      await $.nextTick();

      const div = element.shadowRoot?.querySelector('div');
      if (!div) throw new Error('Expected div to exist in shadowRoot');
      expect(div.getAttribute('part')).toBe('active');

      active.value = false;
      await $.nextTick();
      expect(div.getAttribute('part')).toBe('');
    });

    it('should automatically handle static aejDispatch', async () => {
      const count = $.atom(0);
      const spy = vi.fn();
      const element = defineAndCreate(
        'static-dispatch',
        class extends HTMLElement {
          static aejDispatch = { update: count };
          aej = $.useAtomComponent(this);
          connectedCallback() {
            this.aej.setup();
          }
        }
      );

      element.addEventListener('update', (e: Event) => spy((e as CustomEvent).detail.value));
      appendToBody(element);
      await $.nextTick();

      count.value = 100;
      await $.nextTick();
      expect(spy).toHaveBeenCalledWith(100);
    });

    it('should automatically handle static aejValue & aejValidation (FACE)', async () => {
      const value = $.atom('initial');
      const element = defineAndCreate(
        'static-face',
        class extends HTMLElement {
          static formAssociated = true;
          static aejValue = value;
          static aejValidation = (v: string) => (v.length > 3 ? '' : 'too short');
          aej = $.useAtomComponent(this);
          connectedCallback() {
            this.aej.setup();
          }
        }
      );
      element.setAttribute('name', 'test');
      const form = document.createElement('form');
      form.appendChild(element);
      appendToBody(form);
      await $.nextTick();

      expect(new FormData(form).get('test')).toBe('initial');
      expect(form.checkValidity()).toBe(true);

      value.value = 'abc';
      await $.nextTick();
      expect(form.checkValidity()).toBe(false);
      expect(element.aej.internals?.validationMessage).toBe('too short');
    });
  });

  describe('Edge Cases, Caching, and Fallbacks', () => {
    it('should evict style cache using FIFO strategy when limit is exceeded', async () => {
      const { sheetCache, getOrCreateSheet } = await import('@/features/web-component/engine');
      sheetCache.clear();

      // Warm up cache to limit (100)
      for (let i = 0; i < 100; i++) {
        getOrCreateSheet(`.class-${i} { color: red; }`);
      }
      expect(sheetCache.size).toBe(100);

      // Trigger eviction
      getOrCreateSheet('.new-class { color: blue; }');
      expect(sheetCache.size).toBe(100);
      expect(sheetCache.has('.class-0 { color: red; }')).toBe(false); // First key evicted
      expect(sheetCache.has('.new-class { color: blue; }')).toBe(true);
    });

    it('should maintain 0 subscriber count in stateless proxy WritableAtom', () => {
      const host = document.createElement('div');
      appendToBody(host);
      $.provideAtom(host, 'context-proxy-key', $.atom(100));

      const proxyAtom = $.injectAtom<number>(host, 'context-proxy-key');
      if (!proxyAtom) throw new Error('Expected proxyAtom to be defined');

      expect(proxyAtom.subscriberCount()).toBe(0);

      // In stateless proxy, subscriber count doesn't track global retainers
      const unsubscribeCallback = proxyAtom.subscribe(() => {});
      expect(proxyAtom.subscriberCount()).toBe(0);

      unsubscribeCallback();
      expect(proxyAtom.subscriberCount()).toBe(0);

      proxyAtom.dispose();
      host.remove();
    });

    it('should handle non-string selectors and DocumentFragments safely in scoped jQuery selector $', () => {
      const element = document.createElement('div');
      const ctrl = $.useAtomComponent(element);
      const child = document.createElement('span');
      element.appendChild(child);

      // Non-string selector wrapping
      const wrapped = ctrl.$(child);
      expect(wrapped[0]).toBe(child);

      // DocumentFragment fallback query
      const frag = document.createDocumentFragment();
      const fragChild = document.createElement('p');
      frag.appendChild(fragChild);
      ctrl.setup(frag);
      const queried = ctrl.$('p');
      expect(queried[0]).toBe(fragChild);

      ctrl.teardown();
    });

    it('should adopt styles and cleanup stylesheets upon teardown', () => {
      const css = ':host { margin: 10px; }';
      const element = defineAndCreate(
        'style-cleanup',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            $.useAtomComponent(this).setup({ shadowRoot: sr, styles: [css] });
          }
        }
      );

      appendToBody(element);
      const sr = element.shadowRoot;
      if (!sr) throw new Error('Expected ShadowRoot to exist');
      expect(sr.adoptedStyleSheets.length).toBeGreaterThan(0);

      element.aej.teardown();
      // Stylesheets removed from adopted list
      expect(sr.adoptedStyleSheets.length).toBe(0);
      element.remove();
    });

    it('should safely format parts attribute with diverse types (Array, falsy, custom object)', async () => {
      const partAtom = $.atom<string[] | null>(['partA', 'partB']);
      const element = defineAndCreate(
        'parts-format',
        class extends HTMLElement {
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<div data-aej-part="mybox"></div>';
            $.useAtomComponent(this).setup({ shadowRoot: sr, parts: { mybox: partAtom } });
          }
        }
      );

      appendToBody(element);
      await $.nextTick();
      const div = element.shadowRoot?.querySelector('div');
      if (!div) throw new Error('Expected div to exist');
      expect(div.getAttribute('part')).toBe('partA partB');

      // Test falsy fallback
      partAtom.value = null;
      await $.nextTick();
      expect(div.getAttribute('part')).toBe('');

      element.aej.teardown();
      element.remove();
    });

    it('should sync validity state with native element internals using raw ValidityStateFlags', async () => {
      const email = $.atom('valid@example.com');
      // Pass a custom computed atom containing raw ValidityStateFlags
      const validationFlags = $.computed(() => {
        return email.value.includes('@') ? {} : { typeMismatch: true };
      });

      const element = defineAndCreate(
        'face-flags-validation',
        class extends HTMLElement {
          static formAssociated = true;
          connectedCallback() {
            $.useAtomComponent(this).setup({
              value: email,
              validation: validationFlags,
            });
          }
        }
      );

      const form = document.createElement('form');
      form.appendChild(element);
      appendToBody(form);
      await $.nextTick();

      expect(form.checkValidity()).toBe(true);

      email.value = 'invalid-email';
      await $.nextTick();

      // According to ElementInternals specs, if no error message is provided, ValidityState is reset/valid
      expect(element.aej.internals?.validity.typeMismatch).toBe(false);
      expect(form.checkValidity()).toBe(true);

      element.aej.teardown();
      element.remove();
    });

    it('should resolve static values and getter functions in resolveValue utility', async () => {
      const { resolveValue } = await import('@/features/web-component/utils');
      // 1. Static value
      expect(resolveValue(42)).toBe(42);
      // 2. Getter function
      expect(resolveValue(() => 'getter-output')).toBe('getter-output');
    });

    it('should disable auto-cleanup on teardown even when shadow root (sr) is null to prevent memory leaks', async () => {
      const registry = await import('@/core/registry');
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);

      try {
        $(child).atomText($.atom('value'));
        expect(registry.registry.hasBind(child)).toBe(true);

        const ctrl = $.useAtomComponent(parent);
        ctrl.setup();

        ctrl.teardown();

        child.remove();
        await $.nextTick();
        await $.nextTick();

        expect(registry.registry.hasBind(child)).toBe(true);
      } finally {
        child.remove();
        parent.remove();
        registry.registry.cleanup(child);
        registry.registry.cleanup(parent);
      }
    });
  });
});
