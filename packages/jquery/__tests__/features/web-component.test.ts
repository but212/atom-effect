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

      // 1. Identity & Writable access
      expect(injected).toBe(atom);
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
});
