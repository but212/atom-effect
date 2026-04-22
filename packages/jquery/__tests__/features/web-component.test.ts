import { beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

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

      // Identity: One element, one controller
      expect(ctrl1).toBe(ctrl2);

      // Atomic State: Teardown clears all internal markers
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

      // 1. Value access & Writable behavior
      expect(injected?.value).toBe(atom.value);
      injected!.value = 'updated';
      expect(atom.value).toBe('updated');

      // 2. Late Providing & Reactivity
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

      // Teardown should clear providers and notify consumers
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

      // Move consumer to providerB
      providerB.appendChild(consumer);

      // Expected: Injected atom proxy should now resolve to B's value
      expect(injected?.value).toBe('B');
    });

    it('should have consistent API between $.injectAtom and controller.injectAtom', () => {
      const el = document.createElement('div');
      const atom = $.atom('val');
      $.provideAtom(document.body, 'key', atom);
      document.body.appendChild(el);

      const ctrl = $.useAtomComponent(el);
      const injectedFromStatic = $.injectAtom(el, 'key');
      const injectedFromCtrl = ctrl.injectAtom('key');

      // Both should return the same proxy atom
      expect(typeof injectedFromStatic?.value).toBe('string');
      expect(typeof injectedFromCtrl?.value).toBe('string');
      expect(injectedFromCtrl).toBe(injectedFromStatic);
    });
  });

  describe('Scoped Selector ($)', () => {
    it('should correctly scope queries to shadow root or host fallback', () => {
      const el = document.createElement('div');
      el.innerHTML = '<span class="host-item"></span>';
      const ctrl = $.useAtomComponent(el);

      // Fallback to host
      expect(ctrl.$('.host-item').length).toBe(1);

      // Switch to ShadowRoot
      const sr = el.attachShadow({ mode: 'open' });
      sr.innerHTML = '<span class="shadow-item"></span>';
      ctrl.setup(sr);

      expect(ctrl.$('.shadow-item').length).toBe(1);
      expect(ctrl.$('.host-item').length).toBe(0);
    });
  });

  describe('Global Config & Auto-Cleanup', () => {
    it('should respect custom auto-cleanup roots', async () => {
      const host = document.createElement('div');
      const sr = host.attachShadow({ mode: 'open' });
      document.body.appendChild(host);

      $.initAEJ({ autoCleanup: { root: sr } });

      const target = document.createElement('div');
      sr.appendChild(target);
      const atom = $.atom('v');
      $(target).atomText(atom);

      target.remove(); // Removal from custom root
      await vi.waitFor(() => {
        atom.value = 'dead';
        return target.textContent !== 'dead';
      });
    });
  });

  describe('Full Integration', () => {
    it('should handle complex component lifecycle with Shadow DOM and DI', async () => {
      const theme = $.atom('light');
      const container = document.createElement('div');
      document.body.appendChild(container);
      $.provideAtom(container, 'theme', theme);

      class TestComp extends HTMLElement {
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

      const randomName = `test-comp-${Math.random().toString(36).slice(2, 7)}`;
      customElements.define(randomName, TestComp);
      const el = document.createElement(randomName) as TestComp;
      container.appendChild(el);

      const btn = el.shadowRoot!.querySelector('button');
      expect(btn?.textContent).toBe('light');

      theme.value = 'dark';
      await $.nextTick();
      expect(btn?.textContent).toBe('dark');

      container.remove();
    });
  });

  describe('Advanced Features (Automated Sync & Bridge)', () => {
    it('should automatically bump version when node moves between providers', async () => {
      const p1 = document.createElement('div');
      const p2 = document.createElement('div');
      const consumer = document.createElement('div');

      $.provideAtom(p1, 'key', 'value1');
      $.provideAtom(p2, 'key', 'value2');
      p1.appendChild(consumer);
      document.body.appendChild(p1);
      document.body.appendChild(p2);

      const injected = $.injectAtom(consumer, 'key');
      const spy = vi.fn(() => injected?.value);
      $.effect(() => {
        spy();
        return undefined;
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveReturnedWith('value1');

      // Move node - triggers globalTreeObserver MutationObserver
      p2.appendChild(consumer);

      // Wait for MutationObserver microtask and Effect flush
      await $.nextTick();
      await $.nextTick();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveReturnedWith('value2');
    });

    it('should synchronize provided atoms to CSS custom properties (CSS Bridge)', async () => {
      const el = document.createElement('div');
      const theme = $.atom('dark');
      $.provideAtom(el, 'theme', theme);

      expect(el.style.getPropertyValue('--aej-theme')).toBe('dark');

      theme.value = 'light';
      await $.nextTick();
      expect(el.style.getPropertyValue('--aej-theme')).toBe('light');
    });

    it('should automatically synchronize observedAttributes to reactive atoms', async () => {
      class AttrComp extends HTMLElement {
        static observedAttributes = ['active'];
        aej = $.useAtomComponent(this);
      }
      const randomName = `attr-comp-${Math.random().toString(36).slice(2, 7)}`;
      customElements.define(randomName, AttrComp);

      const el = document.createElement(randomName) as AttrComp;
      el.setAttribute('active', 'true');
      document.body.appendChild(el);
      el.aej.setup();

      const attrs = el.aej.attrs;
      expect(attrs.active?.value).toBe('true');

      el.setAttribute('active', 'false');
      // Wait for MutationObserver batch
      await $.nextTick();
      await $.nextTick();
      expect(attrs.active?.value).toBe('false');
    });
  });
});
