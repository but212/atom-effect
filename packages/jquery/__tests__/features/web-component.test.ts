import { beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import type { AtomComponentController } from '@/types';

/**
 * Utility: Defines a custom element with a unique name and returns an instance.
 */
function defineAndCreate<T extends HTMLElement>(
  tagPrefix: string,
  klass: CustomElementConstructor
): T & { aej: AtomComponentController } {
  const name = `${tagPrefix}-${Math.random().toString(36).slice(2, 7)}`;
  customElements.define(name, klass);
  return document.createElement(name) as T & { aej: AtomComponentController };
}

type PrewarmElement = HTMLElement & {
  aej: AtomComponentController;
  slots: AtomComponentController['slots'];
};

type CleanupElement = HTMLElement & {
  aej: AtomComponentController;
  addSpy: ReturnType<typeof vi.spyOn>;
  removeSpy: ReturnType<typeof vi.spyOn>;
};

/**
 * Utility: Waits for native browser tasks (like slotchange) to complete.
 */
const waitForTasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Web Component Features', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Lifecycle & Registry', () => {
    it('should ensure controller idempotency and atomic teardown', () => {
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

    it('should prevent re-initialization with conflicting shadow roots', () => {
      const el = document.createElement('div');
      const ctrl = $.useAtomComponent(el);
      ctrl.setup(el.attachShadow({ mode: 'open' }));

      const conflict = document.createElement('div') as unknown as ShadowRoot;
      expect(() => ctrl.setup(conflict)).toThrow(/teardown/i);
    });
  });

  describe('Dependency Injection (DI)', () => {
    it('should resolve and update atoms through composed DOM tree', async () => {
      const provider = document.createElement('div');
      const consumer = document.createElement('div');
      const atom = $.atom('initial');

      $.provideAtom(provider, 'key', atom);
      provider.appendChild(consumer);

      const injected = $.injectAtom(consumer, 'key');
      expect(injected?.value).toBe(atom.value);

      injected!.value = 'updated';
      expect(atom.value).toBe('updated');

      const lateConsumer = document.createElement('div');
      provider.appendChild(lateConsumer);
      const lateInjected = $.injectAtom(lateConsumer, 'theme');

      expect(lateInjected?.value).toBeNull();
      $.provideAtom(provider, 'theme', 'dark');
      await $.nextTick();
      expect(lateInjected?.value).toBe('dark');
    });

    it('should respect hierarchy priority and teardown isolation', async () => {
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

    it('should maintain reactivity when node is moved to a different provider', async () => {
      const providerA = document.createElement('div');
      const providerB = document.createElement('div');
      const consumer = document.createElement('div');
      const atomA = $.atom('A');
      const atomB = $.atom('B');

      $.provideAtom(providerA, 'data', atomA);
      $.provideAtom(providerB, 'data', atomB);

      providerA.appendChild(consumer);
      const injected = $.injectAtom(consumer, 'data');
      expect(injected?.value).toBe('A');

      providerB.appendChild(consumer);
      expect(injected?.value).toBe('B');
    });
  });

  describe('Scoped Selector ($)', () => {
    it('should correctly scope queries to shadow root or host fallback', () => {
      const el = document.createElement('div');
      el.innerHTML = '<span class="host-item"></span>';
      const ctrl = $.useAtomComponent(el);

      expect(ctrl.$('.host-item').length).toBe(1);

      const sr = el.attachShadow({ mode: 'open' });
      sr.innerHTML = '<span class="shadow-item"></span>';
      ctrl.setup(sr);

      expect(ctrl.$('.shadow-item').length).toBe(1);
      expect(ctrl.$('.host-item').length).toBe(0);
    });
  });

  describe('Full Integration', () => {
    it('should handle complex component lifecycle with Shadow DOM and DI', async () => {
      const theme = $.atom('light');
      const container = document.createElement('div');
      document.body.appendChild(container);
      $.provideAtom(container, 'theme', theme);

      const el = defineAndCreate(
        'test-comp',
        class extends HTMLElement {
          private aej = $.useAtomComponent(this);
          private theme = $.injectAtom(this, 'theme');

          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<button></button>';
            this.aej.setup(sr);
            this.aej.$('button').atomText(() => this.theme?.value);
          }
          disconnectedCallback() {
            this.aej.teardown();
          }
        }
      );
      container.appendChild(el);

      const btn = el.shadowRoot!.querySelector('button');
      expect(btn?.textContent).toBe('light');

      theme.value = 'dark';
      await $.nextTick();
      expect(btn?.textContent).toBe('dark');
    });
  });

  describe('Advanced Features (Automated Sync & Bridge)', () => {
    it('should automatically synchronize observedAttributes to reactive atoms', async () => {
      const el = defineAndCreate(
        'attr-comp',
        class extends HTMLElement {
          static observedAttributes = ['active'];
          aej = $.useAtomComponent(this);
        }
      );

      el.setAttribute('active', 'true');
      document.body.appendChild(el);
      el.aej.setup();

      await vi.waitFor(() => expect(el.aej.attrs('active').value).toBe('true'));

      el.setAttribute('active', 'false');
      await vi.waitFor(() => expect(el.aej.attrs('active').value).toBe('false'));
    });

    it('should not expose unobserved attributes in the initial reactive snapshot', async () => {
      const el = defineAndCreate(
        'attr-filter-comp',
        class extends HTMLElement {
          static observedAttributes = ['active'];
          aej = $.useAtomComponent(this);
        }
      );

      el.setAttribute('active', 'true');
      el.setAttribute('data-extra', 'stale');
      document.body.appendChild(el);
      el.aej.setup();

      await vi.waitFor(() => expect(el.aej.attrs('active').value).toBe('true'));
      expect(el.aej.attrs('data-extra').value).toBeUndefined();
    });
  });

  describe('Evolution Features', () => {
    it('should track assigned nodes in slots reactively', async () => {
      const el = defineAndCreate(
        'slot-comp',
        class extends HTMLElement {
          aej = $.useAtomComponent(this);
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<slot></slot><slot name="header"></slot>';
            this.aej.setup(sr);
          }
        }
      );
      document.body.appendChild(el);

      const slots = el.aej.slots;
      await $.nextTick();
      expect(slots('default').value.length).toBe(0);

      const child = document.createElement('span');
      el.appendChild(child);
      await waitForTasks();
      expect(slots('default').value[0]).toBe(child);

      const headerChild = document.createElement('h1');
      headerChild.setAttribute('slot', 'header');
      el.appendChild(headerChild);
      await waitForTasks();
      expect(slots('header').value.length).toBe(1);
    });

    it('should track assigned nodes for closed shadow roots when setup receives the root', async () => {
      const el = defineAndCreate(
        'closed-slot-comp',
        class extends HTMLElement {
          aej = $.useAtomComponent(this);

          connectedCallback() {
            const sr = this.attachShadow({ mode: 'closed' });
            sr.innerHTML = '<slot></slot><slot name="header"></slot>';
            this.aej.setup(sr);
          }
        }
      );
      document.body.appendChild(el);

      const slots = el.aej.slots;
      await $.nextTick();
      expect(slots('default').value.length).toBe(0);

      const child = document.createElement('span');
      el.appendChild(child);
      await waitForTasks();
      expect(slots('default').value[0]).toBe(child);

      const headerChild = document.createElement('h1');
      headerChild.setAttribute('slot', 'header');
      el.appendChild(headerChild);
      await waitForTasks();
      expect(slots('header').value[0]).toBe(headerChild);
    });

    it('should recover slot tracking when slots are accessed before setup for closed roots', async () => {
      const el = defineAndCreate<PrewarmElement>(
        'closed-slot-prewarm-comp',
        class extends HTMLElement {
          aej = $.useAtomComponent(this);
          slots = this.aej.slots;

          connectedCallback() {
            const sr = this.attachShadow({ mode: 'closed' });
            sr.innerHTML = '<slot></slot>';
            this.aej.setup(sr);
          }
        }
      );

      const slots = el.slots;
      document.body.appendChild(el);
      await $.nextTick();
      expect(slots('default').value.length).toBe(0);

      const child = document.createElement('span');
      el.appendChild(child);
      await waitForTasks();
      expect(slots('default').value[0]).toBe(child);
    });

    it('should remove slotchange listeners from closed shadow roots during teardown', async () => {
      const el = defineAndCreate<CleanupElement>(
        'closed-slot-cleanup-comp',
        class extends HTMLElement {
          aej = $.useAtomComponent(this);
          addSpy!: ReturnType<typeof vi.spyOn>;
          removeSpy!: ReturnType<typeof vi.spyOn>;

          connectedCallback() {
            const sr = this.attachShadow({ mode: 'closed' });
            sr.innerHTML = '<slot></slot>';
            this.addSpy = vi.spyOn(sr, 'addEventListener');
            this.removeSpy = vi.spyOn(sr, 'removeEventListener');
            this.aej.setup(sr);
          }
        }
      );
      document.body.appendChild(el);

      el.aej.slots('default');
      expect(el.addSpy).toHaveBeenCalledWith('slotchange', expect.any(Function));

      el.aej.teardown();
      expect(el.removeSpy).toHaveBeenCalledWith('slotchange', expect.any(Function));
    });

    it('should automatically dispatch custom events when atoms change', async () => {
      const count = $.atom(0);
      const log = vi.fn();

      const el = defineAndCreate(
        'dispatch-comp',
        class extends HTMLElement {
          aej = $.useAtomComponent(this);
          connectedCallback() {
            this.aej.setup({
              dispatch: {
                'count-changed': count,
                'is-even': () => count.value % 2 === 0,
              },
            });
          }
        }
      );

      el.addEventListener('count-changed', (e) => log('count', (e as CustomEvent).detail.value));
      el.addEventListener('is-even', (e) => log('even', (e as CustomEvent).detail.value));
      document.body.appendChild(el);

      count.value = 1;
      await $.nextTick();
      expect(log).toHaveBeenCalledWith('count', 1);
      expect(log).toHaveBeenCalledWith('even', false);
    });

    it('should hydrate elements and support dynamic additions', async () => {
      const nameAtom = $.atom('Alice');
      const el = defineAndCreate(
        'bind-comp',
        class extends HTMLElement {
          aej = $.useAtomComponent(this);
          connectedCallback() {
            const sr = this.attachShadow({ mode: 'open' });
            sr.innerHTML = '<div class="container"><span data-bind="username"></span></div>';
            this.aej.setup({ shadowRoot: sr, bind: { username: nameAtom } });
          }
        }
      );
      document.body.appendChild(el);

      const sr = el.shadowRoot!;
      expect(sr.querySelector('[data-bind="username"]')?.textContent).toBe('Alice');

      // Test dynamic hydration (Synthesis)
      const newEl = document.createElement('span');
      newEl.setAttribute('data-bind', 'username');
      sr.querySelector('.container')!.appendChild(newEl);

      await $.nextTick();
      expect(newEl.textContent).toBe('Alice');

      nameAtom.value = 'Bob';
      await $.nextTick();
      expect(newEl.textContent).toBe('Bob');
    });

    it('should re-hydrate previously bound nodes after teardown and setup', async () => {
      const nameAtom = $.atom('Alice');
      const el = document.createElement('div');
      const ctrl = $.useAtomComponent(el);
      const sr = el.attachShadow({ mode: 'open' });
      sr.innerHTML = '<span data-bind="username"></span>';

      ctrl.setup({ shadowRoot: sr, bind: { username: nameAtom } });
      expect(sr.querySelector('[data-bind="username"]')?.textContent).toBe('Alice');

      ctrl.teardown();

      nameAtom.value = 'Bob';
      ctrl.setup({ shadowRoot: sr, bind: { username: nameAtom } });
      await $.nextTick();
      expect(sr.querySelector('[data-bind="username"]')?.textContent).toBe('Bob');

      nameAtom.value = 'Carol';
      await $.nextTick();
      expect(sr.querySelector('[data-bind="username"]')?.textContent).toBe('Carol');
    });
  });
});
