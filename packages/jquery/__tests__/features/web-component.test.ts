import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '@/core/registry';
import $ from '@/index';

describe('Web Component in AEJ', () => {
  const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Lifecycle & Memory Management', () => {
    it('should manage reactive lifecycle (setup/teardown/cleanup) correctly', async () => {
      const cleanupSpy = vi.spyOn(registry, 'cleanupTree');
      const tagName = 'lifecycle-comp';

      class LifecycleComp extends HTMLElement {
        private aej = $.useAtomComponent(this);
        constructor() {
          super();
          this.attachShadow({ mode: 'open' });
        }
        connectedCallback() {
          this.aej.setup();
        }
        disconnectedCallback() {
          this.aej.teardown();
        }
      }

      if (!customElements.get(tagName)) customElements.define(tagName, LifecycleComp);
      const el = document.createElement(tagName) as HTMLElement & { [CLEANUP_MARKER]?: boolean };

      // 1. Setup
      document.body.appendChild(el);
      const boundary = (el.shadowRoot || el) as Node & { [CLEANUP_MARKER]?: boolean };
      expect(boundary[CLEANUP_MARKER]).toBe(true);

      // 2. Teardown & Cleanup
      el.remove();
      // Marker should be reset immediately
      expect(boundary[CLEANUP_MARKER]).toBe(false);
      // Actual deep cleanup deferred to microtask
      await vi.waitFor(() => {
        expect(cleanupSpy).toHaveBeenCalledWith(el);
        expect(cleanupSpy).toHaveBeenCalledWith(el.shadowRoot);
      });

      // 3. Re-init (Idempotency)
      document.body.appendChild(el);
      expect(boundary[CLEANUP_MARKER]).toBe(true);
    });

    it('should support automatic cleanup for Closed Shadow DOM via useAtomComponent', async () => {
      const tagName = 'closed-shadow-comp';
      class ClosedShadowComp extends HTMLElement {
        private aej = $.useAtomComponent(this);
        public inner = document.createElement('div');
        private _sr: ShadowRoot | null = null;

        connectedCallback() {
          if (!this._sr) this._sr = this.attachShadow({ mode: 'closed' });
          this._sr.appendChild(this.inner);
          this.aej.setup(this._sr);
          $(this.inner).atomText($.atom('inner'));
        }
        disconnectedCallback() {
          this.aej.teardown();
        }
      }

      if (!customElements.get(tagName)) customElements.define(tagName, ClosedShadowComp);
      const el = document.createElement(tagName) as ClosedShadowComp;
      document.body.appendChild(el);

      expect(registry.hasBind(el.inner)).toBe(true);
      el.remove();
      await vi.waitFor(() => expect(registry.hasBind(el.inner)).toBe(false));
    });
  });

  describe('Dependency Injection (Provide / Inject)', () => {
    it('should resolve context regardless of input type (Element, JQuery, Selector)', () => {
      const atom = $.atom('val');
      const $parent = $('<div id="p"></div>').appendTo('body');
      const $child = $('<div class="c"></div>').appendTo($parent);

      // Test Matrix: provide(type) -> inject(type)
      const testCases: {
        prov: string | HTMLElement | JQuery;
        inj: string | HTMLElement | JQuery;
      }[] = [
        { prov: $parent[0]!, inj: $child[0]! },
        { prov: $parent, inj: $child },
        { prov: '#p', inj: '.c' },
      ];

      for (const { prov, inj } of testCases) {
        $.provideAtom(prov, 'key', atom);
        expect($.injectAtom(inj, 'key')).toBe(atom);
      }

      // Cleanup
      $parent.remove();
    });

    it('should bubble requests and traverse shadow boundaries', () => {
      const atom = $.atom('context');
      const $provider = $('<div id="provider"></div>').appendTo('body');
      $.provideAtom($provider, 'key', atom);

      const tagName = 'shadow-consumer';
      class ShadowConsumer extends HTMLElement {
        public received: unknown = null;
        constructor() {
          super();
          this.attachShadow({ mode: 'open' });
        }
        connectedCallback() {
          const inner = document.createElement('div');
          this.shadowRoot?.appendChild(inner);
          this.received = $.injectAtom(inner, 'key');
        }
      }
      if (!customElements.get(tagName)) customElements.define(tagName, ShadowConsumer);

      const consumer = document.createElement(tagName) as ShadowConsumer;
      $provider.append(consumer);

      expect(consumer.received).toBe(atom);
      $provider.remove();
    });
  });

  describe('Move Mechanics (Microtask Deferral)', () => {
    it('should preserve state during DOM moves and only cleanup on final removal', async () => {
      const cleanupSpy = vi.spyOn(registry, 'cleanupTree');
      const tagName = 'moveable-comp';

      class MoveableComp extends HTMLElement {
        private aej = $.useAtomComponent(this);
        public inner = document.createElement('div');
        connectedCallback() {
          this.appendChild(this.inner);
          this.aej.setup();
          $(this.inner).atomText($.atom('state'));
        }
        disconnectedCallback() {
          this.aej.teardown();
        }
      }
      if (!customElements.get(tagName)) customElements.define(tagName, MoveableComp);

      const el = document.createElement(tagName) as MoveableComp;
      const p1 = document.createElement('div');
      const p2 = document.createElement('div');
      document.body.append(p1, p2, el);

      // Case 1: Synchronous Move
      p1.appendChild(el);
      cleanupSpy.mockClear();
      p2.appendChild(el); // Move to p2

      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).not.toHaveBeenCalled();
      expect(registry.hasBind(el.inner)).toBe(true);

      // Case 2: Final Removal
      p2.remove();
      await vi.waitFor(() => expect(registry.hasBind(el.inner)).toBe(false));
    });
  });
});
