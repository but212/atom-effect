import { beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Web Component Features', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    // Ensure clean state for each test
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Lifecycle & Memory Management', () => {
    it('should maintain single instance per element (idempotency)', () => {
      const tagName = 'idempotent-comp';
      class Comp extends HTMLElement {
        public aej = $.useAtomComponent(this);
      }
      if (!customElements.get(tagName)) customElements.define(tagName, Comp);
      const el = document.createElement(tagName) as Comp;

      // 1. Singleton check (Behavior: Same controller instance)
      const ctrl2 = $.useAtomComponent(el);
      expect(ctrl2).toBe(el.aej);

      // 2. Safe re-setup behavior
      el.aej.setup(el.attachShadow({ mode: 'open' }));
      expect(el.aej.root).not.toBeNull();
      el.aej.teardown();
      expect(el.aej.root).toBeNull();
    });

    it('should support Closed Shadow DOM and preserve state during moves', async () => {
      const tagName = 'advanced-cleanup-comp';
      const atom = $.atom('state');

      class Comp extends HTMLElement {
        public aej = $.useAtomComponent(this);
        public inner = document.createElement('div');
        private _sr: ShadowRoot | null = null;

        connectedCallback() {
          if (!this._sr) {
            this._sr = this.attachShadow({ mode: 'closed' });
            this._sr.appendChild(this.inner);
          }
          this.aej.setup(this._sr);
          $(this.inner).atomText(atom);
        }
      }

      if (!customElements.get(tagName)) customElements.define(tagName, Comp);
      const el = document.createElement(tagName) as Comp;
      const p1 = document.createElement('div');
      const p2 = document.createElement('div');
      document.body.append(p1, p2, el);

      // Move (Behavior: Binding preserved during microtask)
      p1.appendChild(el);
      p2.appendChild(el);
      await $.nextTick();

      atom.value = 'updated';
      await vi.waitFor(() => expect(el.inner.textContent).toBe('updated'));

      // Final removal (Behavior: Auto-cleanup triggered)
      p2.remove();
      await vi.waitFor(() => {
        atom.value = 'dead';
        return el.inner.textContent !== 'dead';
      });
    });

    it('should not throw DOMException when setup() is called in constructor', () => {
      const tagName = 'constructor-setup-comp';
      class Comp extends HTMLElement {
        private aej = $.useAtomComponent(this);
        constructor() {
          super();
          this.attachShadow({ mode: 'open' });
          // Logic: Safe to call setup in constructor even if it adds classes (deferred)
          this.aej.setup();
        }
      }
      if (!customElements.get(tagName)) customElements.define(tagName, Comp);
      expect(() => {
        document.createElement(tagName);
      }).not.toThrow();
    });
  });

  describe('Scoped Selector ($)', () => {
    it('should restrict lookups to the active root with fallback support', () => {
      const el = document.createElement('div');
      el.innerHTML = '<span class="in">1</span>';
      $('<span class="out">2</span>').appendTo('body');

      const ctrl = $.useAtomComponent(el);

      // Behavior: Fallback to host when setup() not called or root is null
      expect(ctrl.$('.in').length).toBe(1);

      // Behavior: Scoped to shadow after setup
      const sr = el.attachShadow({ mode: 'open' });
      sr.innerHTML = '<b class="in">3</b>';
      ctrl.setup();

      expect(ctrl.$('.in').text()).toBe('3');
      expect(ctrl.$('.out').length).toBe(0);

      // Behavior: Support explicit context within scope
      sr.innerHTML = '<div id="c"><i class="in">4</i></div>';
      expect(ctrl.$('.in', ctrl.$('#c')[0]).text()).toBe('4');
    });
  });

  describe('Dependency Injection', () => {
    it('should resolve atoms through complex DOM/Shadow hierarchies', () => {
      const atom = $.atom('val');
      const provider = document.createElement('div');
      const consumer = document.createElement('div');
      $.provideAtom(provider, 'key', atom);

      // 1. Basic resolution & Null fallbacks
      expect($.injectAtom(consumer, 'key')?.value).toBeNull();
      provider.appendChild(consumer);
      expect($.injectAtom(consumer, 'key')?.value).toBe(atom.value);
      expect($.injectAtom(provider, 'unknown')?.value).toBeNull();

      // 2. Shadow Boundary Traversal (The "composed" path)
      const shadowHost = document.createElement('div');
      const sr = shadowHost.attachShadow({ mode: 'open' });
      const deepChild = document.createElement('span');
      sr.appendChild(deepChild);
      provider.appendChild(shadowHost);

      expect($.injectAtom(deepChild, 'key')?.value).toBe(atom.value);
    });

    it('should respect nearest-ancestor priority and overrides', () => {
      const gp = document.createElement('div');
      const p = document.createElement('div');
      const c = document.createElement('div');
      gp.appendChild(p);
      p.appendChild(c);
      document.body.appendChild(gp);

      const a1 = $.atom(1);
      const a2 = $.atom(2);
      $.provideAtom(gp, 'k', a1);
      $.provideAtom(p, 'k', a2); // Closer provider wins
      expect($.injectAtom(c, 'k')?.value).toBe(a2.value);

      const a3 = $.atom(3);
      $.provideAtom(p, 'k', a3); // Runtime override
      expect($.injectAtom(c, 'k')?.value).toBe(3);
    });

    it('should re-evaluate computed atom after connection (Late Binding)', async () => {
      const tagName = 'late-binding-comp';
      const atom = $.atom('initial');

      class Comp extends HTMLElement {
        private aej = $.useAtomComponent(this);
        public theme = $.injectAtom(this, 'theme');
        connectedCallback() {
          this.aej.setup();
        }
      }
      if (!customElements.get(tagName)) customElements.define(tagName, Comp);

      const el = document.createElement(tagName) as Comp;
      const provider = document.createElement('div');
      $.provideAtom(provider, 'theme', atom);

      // Before connection: cached null
      expect(el.theme?.value).toBeNull();

      // Connect to provider
      provider.appendChild(el);
      document.body.appendChild(provider);

      await vi.waitFor(() => expect(el.theme?.value).toBe('initial'));
    });

    it('should update consumers when a provider is attached late', async () => {
      const provider = document.createElement('div');
      const consumer = document.createElement('div');
      provider.appendChild(consumer);
      document.body.appendChild(provider);

      const theme = $.injectAtom(consumer, 'theme');
      expect(theme?.value).toBeNull();

      const atom = $.atom('dark');
      $.provideAtom(provider, 'theme', atom);

      await vi.waitFor(() => expect(theme?.value).toBe('dark'));
    });
  });

  describe('Global Configuration (initAEJ)', () => {
    it('should toggle patches and auto-cleanup dynamically', async () => {
      // Behavior: Lifecycle patch and autoCleanup can be opted out
      $.initAEJ({ patch: { lifecycle: false }, autoCleanup: false });
      const el = document.createElement('div');
      document.body.appendChild(el);
      const atom = $.atom('v');
      $(el).atomText(atom).remove();

      atom.value = 'leaked';
      await $.nextTick();
      expect(el.textContent).toBe('leaked'); // Should still update because cleanup was disabled

      // Behavior: Event patch can be opted out
      $.initAEJ({ patch: { events: false } });
      const btn = document.createElement('button');
      let clicked = false;
      $(btn).on('click', () => {
        clicked = true;
      });

      btn.click();
      expect(clicked).toBe(true);
    });

    it('should support custom autoCleanup root (e.g. ShadowRoot)', async () => {
      const container = document.createElement('div');
      const sr = container.attachShadow({ mode: 'open' });
      document.body.appendChild(container);

      $.initAEJ({ autoCleanup: { root: sr } });

      const el = document.createElement('div');
      sr.appendChild(el);
      const atom = $.atom('v');
      $(el).atomText(atom);

      atom.value = 'active';
      await vi.waitFor(() => expect(el.textContent).toBe('active'));

      el.remove(); // Native removal from sr
      await vi.waitFor(() => {
        atom.value = 'cleaned';
        return el.textContent !== 'cleaned';
      });

      container.remove();
    });

    it('should handle multiple initAEJ calls and maintain auto-cleanup functionality', async () => {
      const customRoot = document.createElement('div');
      document.body.appendChild(customRoot);

      // Re-initialize multiple times with different roots
      $.initAEJ({ autoCleanup: true });
      $.initAEJ({ autoCleanup: { root: customRoot } });

      const el = document.createElement('div');
      customRoot.appendChild(el);
      const atom = $.atom('test');
      $(el).atomText(atom);

      expect(el.textContent).toBe('test');

      // Verify cleanup still works
      el.remove();
      await vi.waitFor(() => {
        atom.value = 'cleaned';
        return el.textContent !== 'cleaned';
      });

      customRoot.remove();
    });
  });

  describe('Edge Cases & Regression Tests', () => {
    it('should throw when setup() is called with a different shadowRoot without teardown', () => {
      const el = document.createElement('div');
      const ctrl = $.useAtomComponent(el);
      const sr1 = el.attachShadow({ mode: 'open' });

      ctrl.setup(sr1);

      const fakeShadow = document.createElement('div') as unknown as ShadowRoot;

      expect(() => {
        ctrl.setup(fakeShadow);
      }).toThrow(/teardown/i);
    });

    it('should not resolve injectAtom to providers on the element itself', () => {
      const el = document.createElement('div');
      const atom = $.atom('val');

      $.provideAtom(el, 'key', atom);

      const injected = $.injectAtom(el, 'key');
      expect(injected?.value).toBeNull();
    });
  });

  describe('Integration: Web Components', () => {
    it('should demonstrate a complete reactive component lifecycle with DI and scoped selectors', async () => {
      const themeAtom = $.atom('light');
      const container = document.createElement('div');
      document.body.appendChild(container);

      // Provide context at the app root (No prop drilling)
      $.provideAtom(container, 'theme', themeAtom);

      const tagName = 'aej-vision-component';
      class VisionComp extends HTMLElement {
        private aej = $.useAtomComponent(this);
        private theme = $.injectAtom(this, 'theme');

        connectedCallback() {
          const sr = this.attachShadow({ mode: 'open' });
          sr.innerHTML = `
            <div class="card">
              <span class="theme-label"></span>
              <button class="toggle">Toggle</button>
            </div>
          `;

          // Setup reactive root (Shadow DOM support)
          this.aej.setup(sr);

          // Scoped selection and reactive binding
          this.aej.$('.theme-label').atomText(() => `Theme: ${this.theme?.value}`);

          // Native-feeling interactions
          this.aej.$('.toggle').on('click', () => {
            if (this.theme) {
              themeAtom.value = this.theme.value === 'light' ? 'dark' : 'light';
            }
          });
        }

        disconnectedCallback() {
          // Atomic cleanup
          this.aej.teardown();
        }
      }

      if (!customElements.get(tagName)) customElements.define(tagName, VisionComp);
      const el = document.createElement(tagName);
      container.appendChild(el);

      // Verify DOM updates are applied synchronously when batched
      const label = el.shadowRoot!.querySelector('.theme-label');
      expect(label?.textContent).toBe('Theme: light');

      $.batch(() => {
        themeAtom.value = 'dark';
      });
      expect(label?.textContent).toBe('Theme: dark');

      const btn = el.shadowRoot!.querySelector('.toggle') as HTMLButtonElement;
      btn.click();
      expect(themeAtom.value).toBe('light');
      expect(label?.textContent).toBe('Theme: light');

      // Assertion: Auto-cleanup on removal (Memory safety)
      const atom = $.atom('live');
      const labelEl = el.shadowRoot!.querySelector('.theme-label') as HTMLElement;
      $(labelEl).atomText(atom);

      container.remove();
      await vi.waitFor(() => {
        atom.value = 'cleaned';
        return labelEl.textContent !== 'cleaned';
      });
    });
  });
});
