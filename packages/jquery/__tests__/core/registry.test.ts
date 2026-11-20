import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateRootObserver, rootObserversMap } from '@/core/observer';
import { registry } from '@/core/registry';
import $, { cleanup, disableAutoCleanup, enableAutoCleanup } from '@/index';
import { castTo, setupDOMCleanup } from '../utils/test-helpers';

describe('Binding Registry', () => {
  const { appendToBody } = setupDOMCleanup();
  beforeEach(() => {
    document.body.innerHTML = '';
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Cleanup Lifecycle (Manual)', () => {
    it('should be atomic and idempotent when removing marker classes', async () => {
      const $element = $('<div class="_aes-bound"></div>');

      // 1. Unregistered element should just have its class removed
      cleanup($element);
      expect($element.hasClass('_aes-bound')).toBe(false);

      // 2. Active binding should be disposed and class removed
      const stateAtom = $.atom('initial');
      $element.atomText(stateAtom);
      await $.nextTick();
      expect($element.hasClass('_aes-bound')).toBe(true);

      cleanup($element);
      expect($element.hasClass('_aes-bound')).toBe(false);

      // Verify reactivity is terminated
      stateAtom.value = 'updated';
      expect($element.text()).not.toBe('updated');
    });

    it('should continue cleaning up even if individual disposals fail', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const $element = $('<div>').appendTo(document.body);

      // Register multiple features, one of which throws during cleanup
      $element.atomText($.atom('test'));
      $element.atomMount(() => () => {
        throw new Error('cleanup error');
      });

      cleanup($element);

      expect(errorSpy).toHaveBeenCalled();
      expect($element.hasClass('_aes-bound')).toBe(false);
      errorSpy.mockRestore();
    });

    it('should support manual cleanup with raw HTMLElement', async () => {
      const element = document.createElement('div');
      const stateAtom = $.atom('initial');
      $(element).atomText(stateAtom);
      await $.nextTick();
      expect(element.textContent).toBe('initial');

      // Call cleanup with raw HTMLElement
      cleanup(element);
      stateAtom.value = 'updated';
      await $.nextTick();
      expect(element.textContent).not.toBe('updated');
    });

    it('should log registry.trackEffect throws', () => {
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      $.debug.enabled = true;
      const element = document.createElement('div');
      const mockEffect = castTo<Parameters<typeof registry.trackEffect>[1]>({
        dispose: () => {
          throw new Error('dispose failed');
        },
      });
      registry.trackEffect(element, mockEffect);
      registry.cleanup(element);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should log registry.onCleanup throws', () => {
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      $.debug.enabled = true;
      const element = document.createElement('div');
      registry.onCleanup(element, () => {
        throw new Error('cleanup failed');
      });
      registry.cleanup(element);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should correctly support registry.hasBind check', () => {
      const element = document.createElement('div');
      expect(registry.hasBind(element)).toBe(false);
      $(element).atomText($.atom('test'));
      expect(registry.hasBind(element)).toBe(true);
      registry.cleanup(element);
    });

    it('synchronously marks detached elements and enables immediate descendant cleanup', async () => {
      const stateAtom = $.atom('initial');
      const containerEl = document.createElement('div');
      const child = document.createElement('span');
      containerEl.appendChild(child);

      $(child).atomText(stateAtom);
      // Synchronous marker must be present immediately on detached element
      expect(child.classList.contains('_aes-bound')).toBe(true);

      // Synchronous descendant cleanup on the detached container in the same tick
      registry.cleanupTree(containerEl);
      expect(registry.hasBind(child)).toBe(false);
      expect(child.classList.contains('_aes-bound')).toBe(false);

      // Wait a microtask to ensure the deferred task did not re-add the class
      await Promise.resolve();
      expect(child.classList.contains('_aes-bound')).toBe(false);

      stateAtom.value = 'updated';
      await $.nextTick();
      expect($(child).text()).not.toBe('updated');
    });

    it.each(['open', 'closed'] as const)(
      'cleans up constructor bindings inside a %s shadow root before and after the microtask',
      async (mode) => {
        const source = $.atom('active');
        const tagName = `aej-constructor-shadow-${mode}`;
        class BoundHost extends HTMLElement {
          constructor() {
            super();
            const root = this.attachShadow({ mode });
            const child = root.appendChild(document.createElement('span'));
            $(child).atomText(source);
          }
        }
        customElements.define(tagName, BoundHost);
        const container = document.createElement('div');
        const host = container.appendChild(document.createElement(tagName));

        expect(host).toBeInstanceOf(BoundHost);
        expect(source.subscriberCount()).toBe(1);
        cleanup(container);
        expect(source.subscriberCount()).toBe(0);

        const laterContainer = document.createElement('div');
        laterContainer.appendChild(document.createElement(tagName));
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);
        cleanup(laterContainer);
        expect(source.subscriberCount()).toBe(0);
      }
    );

    it('disposes newly registered effects when a class mutation listener calls registry.cleanup synchronously', () => {
      const tagName = 'aej-cleanup-on-bound-mark';
      if (!customElements.get(tagName)) {
        customElements.define(
          tagName,
          class extends HTMLElement {
            static observedAttributes = ['class'];

            attributeChangedCallback(
              name: string,
              _previous: string | null,
              current: string | null
            ): void {
              if (name === 'class' && current?.split(/\s+/).includes('_aes-bound')) {
                registry.cleanup(this);
              }
            }
          }
        );
      }

      const element = document.body.appendChild(document.createElement(tagName));
      const source = $.atom('value');
      $(element).atomText(source);

      expect(registry.hasBind(element)).toBe(false);
      expect(source.subscriberCount()).toBe(0);
    });
  });

  describe('Auto-Cleanup System (MutationObserver)', () => {
    it('supports bulk detach and native removal in a form with a field named contains', async () => {
      const form = document.body.appendChild(document.createElement('form'));
      form.appendChild(document.createElement('input')).name = 'contains';
      enableAutoCleanup(form);
      const source = $.atom('active');
      const children = [
        form.appendChild(document.createElement('span')),
        form.appendChild(document.createElement('span')),
      ];
      const $children = $(children).atomText(source);
      await Promise.resolve();

      try {
        $children.detach();
        await Promise.resolve();
        expect(children.every((child) => !child.parentNode)).toBe(true);
        expect(source.subscriberCount()).toBe(2);

        form.append(...children);
        for (const child of children) child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $children.atomUnbind();
      }
    });

    it('observes multiple explicitly enabled roots until disabled', async () => {
      $.initAEJ({ patch: false, autoCleanup: false });
      const source = $.atom('active');
      const roots = Array.from({ length: 2 }, () => {
        const host = document.createElement('div');
        appendToBody(host);
        const root = host.attachShadow({ mode: 'open' });
        enableAutoCleanup(root);
        return root;
      });
      const children = roots.map((root) => {
        const child = document.createElement('span');
        root.appendChild(child);
        $(child).atomText(source);
        return child;
      });

      expect(source.subscriberCount()).toBe(2);
      for (const child of children) child.remove();
      await vi.waitFor(() => expect(source.subscriberCount()).toBe(0));

      disableAutoCleanup();
      for (const root of roots) expect(rootObserversMap.has(root)).toBe(false);
    });

    it.each(['outside', 'separate root', 'same root', 'a disconnected tree'])(
      'preserves a move before .detach() into %s',
      async (scope) => {
        const origin = document.body.appendChild(document.createElement('section'));
        const destination = document.createElement('section');
        if (scope !== 'a disconnected tree') document.body.appendChild(destination);
        $.initAEJ({ autoCleanup: { root: scope === 'same root' ? document.body : origin } });
        if (scope === 'separate root') enableAutoCleanup(destination);
        const child = origin.appendChild(document.createElement('span'));
        const source = $.atom('bound');
        const $child = $(child).atomText(source);

        try {
          destination.appendChild(child);
          $child.detach();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(1);
        } finally {
          $child.atomUnbind();
        }
      }
    );

    it.each(['light DOM', 'closed shadow DOM'] as const)(
      'preserves a moved descendant when detaching its ancestor in %s',
      async (scope) => {
        const ancestor = document.body.appendChild(document.createElement('section'));
        const origin = ancestor.appendChild(document.createElement('div'));
        const host = ancestor.appendChild(document.createElement('div'));
        const destination = scope === 'light DOM' ? host : host.attachShadow({ mode: 'closed' });
        const child = origin.appendChild(document.createElement('span'));
        const source = $.atom('bound');
        const $child = $(child).atomText(source);

        try {
          destination.appendChild(child);
          $(ancestor).detach();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(1);

          ancestor.appendChild(child);
          document.body.appendChild(ancestor);
          child.remove();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(0);
        } finally {
          $child.atomUnbind();
        }
      }
    );

    it.each(['open', 'closed'] as const)(
      'cleans a moved binding left inside the %s shadow root after reattachment',
      async (mode) => {
        const ancestor = document.body.appendChild(document.createElement('section'));
        const host = ancestor.appendChild(document.createElement('div'));
        const shadow = host.attachShadow({ mode });
        const child = ancestor.appendChild(document.createElement('span'));
        const source = $.atom('bound');
        const $child = $(child).atomText(source);

        try {
          shadow.appendChild(child);
          $(ancestor).detach();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(1);

          document.body.appendChild(ancestor);
          await Promise.resolve();
          ancestor.remove();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(0);
        } finally {
          $child.atomUnbind();
        }
      }
    );

    it.each([false, true])(
      'does not mutate a shadow host when an unbound node moves into it (detach: %s)',
      async (detachHost) => {
        const host = document.body.appendChild(document.createElement('div'));
        const shadow = host.attachShadow({ mode: 'closed' });
        const child = document.body.appendChild(document.createElement('span'));
        const onAttributeChange = vi.fn();
        const observer = new MutationObserver(onAttributeChange);
        observer.observe(host, { attributeFilter: ['class'] });

        try {
          shadow.append(child);
          if (detachHost) $(host).detach();
          await $.nextTick();
          expect(onAttributeChange).not.toHaveBeenCalled();
        } finally {
          observer.disconnect();
        }
      }
    );

    it('cleans a subtree moved natively into a closed shadow root when its host is removed', async () => {
      const host = document.body.appendChild(document.createElement('div'));
      const shadow = host.attachShadow({ mode: 'closed' });
      const subtree = document.body.appendChild(document.createElement('div'));
      const child = subtree.appendChild(document.createElement('span'));
      const source = $.atom('bound');
      $(child).atomText(source);

      try {
        shadow.append(subtree);
        await $.nextTick();
        expect(source.subscriberCount()).toBe(1);

        host.remove();
        await $.nextTick();
        expect(source.subscriberCount()).toBe(0);
        source.value = 'updated';
        await $.nextTick();
        expect(child.textContent).toBe('bound');
      } finally {
        $(child).atomUnbind();
      }
    });

    it('finds a moved binding in a closed shadow root amid unrelated removals', async () => {
      const host = document.body.appendChild(document.createElement('div'));
      const shadow = host.attachShadow({ mode: 'closed' });
      const child = document.body.appendChild(document.createElement('span'));
      const source = $.atom('bound');
      const $child = $(child).atomText(source);
      try {
        for (let i = 0; i < 8; i++) {
          document.body.appendChild(document.createElement('span')).remove();
        }
        shadow.appendChild(child);
        $(host).detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);
      } finally {
        $child.atomUnbind();
      }
    });

    it('finds a closed shadow root entered after an earlier detach indexed the removal', async () => {
      const host = document.body.appendChild(document.createElement('div'));
      const shadow = host.attachShadow({ mode: 'closed' });
      const sibling = document.body.appendChild(document.createElement('span'));
      const child = document.body.appendChild(document.createElement('span'));
      const parking = document.createElement('div');
      const source = $.atom('bound');
      const $child = $(child).atomText(source);

      try {
        parking.appendChild(child);
        $(sibling).detach();
        shadow.appendChild(child);
        $(host).detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);

        document.body.appendChild(host);
        host.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it('does not protect a moved descendant removed natively after its ancestor is detached', async () => {
      const ancestor = document.body.appendChild(document.createElement('section'));
      const origin = ancestor.appendChild(document.createElement('div'));
      const destination = ancestor.appendChild(document.createElement('div'));
      const child = origin.appendChild(document.createElement('span'));
      const source = $.atom('bound');
      const $child = $(child).atomText(source);

      try {
        destination.appendChild(child);
        $(ancestor).detach();
        child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it.each([1, 2])('preserves %i moved nodes detached during observer delivery', async (count) => {
      const origin = document.body.appendChild(document.createElement('section'));
      const destination = document.body.appendChild(document.createElement('section'));
      $.initAEJ({ autoCleanup: { root: origin } });
      if (count > 1) {
        enableAutoCleanup(document.body.appendChild(document.createElement('section')));
      }

      const trigger = origin.appendChild(document.createElement('div'));
      const children = Array.from({ length: count }, () =>
        origin.appendChild(document.createElement('span'))
      );
      const source = $.atom('bound');
      const $children = $(children).atomText(source);
      $(trigger).atomMount(() => () => {
        $children.detach();
      });
      await $.nextTick();

      try {
        trigger.remove();
        destination.append(...children);
        await Promise.resolve();
        expect(children.every((child) => !child.isConnected)).toBe(true);
        expect(source.subscriberCount()).toBe(count);

        origin.append(...children);
        for (const child of children) child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $children.atomUnbind();
      }
    });

    it('only protects the moved node in a multi-node native removal record', async () => {
      const parent = document.body.appendChild(document.createElement('section'));
      const moved = parent.appendChild(document.createElement('span'));
      const removed = parent.appendChild(document.createElement('span'));
      const movedSource = $.atom('moved');
      const removedSource = $.atom('removed');
      const $moved = $(moved).atomText(movedSource);
      $(removed).atomText(removedSource);

      parent.replaceChildren();
      document.body.appendChild(moved);
      $moved.detach();
      await Promise.resolve();
      expect(movedSource.subscriberCount()).toBe(1);
      expect(removedSource.subscriberCount()).toBe(0);
      $moved.atomUnbind();
    });

    it('does not suppress native removal after .remove(), rebind and .detach()', async () => {
      const child = document.body.appendChild(document.createElement('span'));
      const source = $.atom('bound');
      const $child = $(child).atomText(source);
      $child.remove();
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(0);

      document.body.appendChild(child);
      $child.atomText(source).detach();
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(1);

      document.body.appendChild(child);
      child.remove();
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(0);
    });

    it('preserves native moves inside an observed detached tree', async () => {
      const root = document.body.appendChild(document.createElement('section'));
      enableAutoCleanup(root);
      const first = root.appendChild(document.createElement('div'));
      const second = root.appendChild(document.createElement('div'));
      const child = first.appendChild(document.createElement('span'));
      const source = $.atom('bound');
      $(child).atomText(source);
      $(root).detach();
      await Promise.resolve();

      second.appendChild(child);
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(1);
      child.remove();
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(0);
    });

    it.each(['open', 'closed'] as const)(
      'disposes bindings inside a %s shadow root when a restored ancestor is removed',
      async (mode) => {
        const ancestor = document.body.appendChild(document.createElement('section'));
        const host = ancestor.appendChild(document.createElement('div'));
        const shadow = host.attachShadow({ mode });
        enableAutoCleanup(shadow);
        const child = shadow.appendChild(document.createElement('span'));
        const source = $.atom('bound');
        $(child).atomText(source);
        $(ancestor).detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);

        document.body.appendChild(ancestor);
        ancestor.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
        expect(rootObserversMap.has(shadow)).toBe(false);
      }
    );

    it('still observes descendant removals in a transient subtree during bulk detach', async () => {
      const unrelated = document.body.appendChild(document.createElement('section'));
      enableAutoCleanup(unrelated);
      const parent = document.body.appendChild(document.createElement('section'));
      const first = parent.appendChild(document.createElement('span'));
      const second = parent.appendChild(document.createElement('span'));
      const removed = parent.appendChild(document.createElement('span'));
      const keptSource = $.atom('kept');
      const removedSource = $.atom('removed');
      const $kept = $([first, second]).atomText(keptSource);
      $(removed).atomText(removedSource);
      await Promise.resolve();

      $(parent).detach();
      $kept.detach();
      removed.remove();
      await Promise.resolve();
      expect(keptSource.subscriberCount()).toBe(2);
      expect(removedSource.subscriberCount()).toBe(0);
      $kept.atomUnbind();
    });

    it('does not drain unrelated observer queues for each sibling in a bulk detach', async () => {
      $.initAEJ({ autoCleanup: false });
      const roots = Array.from({ length: 32 }, () => {
        const root = document.body.appendChild(document.createElement('section'));
        enableAutoCleanup(root);
        return root;
      });
      const parent = roots[0] as HTMLElement;
      const source = $.atom('active');
      const children = Array.from({ length: 40 }, () =>
        parent.appendChild(document.createElement('span'))
      );
      const $children = $(children).atomText(source);
      await Promise.resolve();

      const takeRecords = vi.spyOn(MutationObserver.prototype, 'takeRecords');
      try {
        $children.detach();
        expect(takeRecords.mock.calls.length).toBeLessThan(4 * (roots.length + children.length));
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(children.length);
      } finally {
        takeRecords.mockRestore();
        $children.atomUnbind();
      }
    });

    it('does not rescan every earlier record for a bulk detach within one root', async () => {
      const parent = document.body.appendChild(document.createElement('section'));
      const children = Array.from({ length: 64 }, () =>
        parent.appendChild(document.createElement('span'))
      );
      const source = $.atom('active');
      const $children = $(children).atomText(source);
      await Promise.resolve();

      const removedNodes = vi.spyOn(MutationRecord.prototype, 'removedNodes', 'get');
      try {
        $children.detach();
        expect(removedNodes.mock.calls.length).toBeLessThan(8 * children.length);
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(children.length);
      } finally {
        removedNodes.mockRestore();
        $children.atomUnbind();
      }
    });

    it('does not do shadow-root lookups on unrelated parentless removals during bulk detach', async () => {
      const parent = document.body.appendChild(document.createElement('section'));
      const count = 32;
      const createChild = () => parent.appendChild(document.createElement('span'));
      const removedChildren = Array.from({ length: count }, createChild);
      const children = Array.from({ length: count }, createChild);
      const removed = new Set<unknown>(removedChildren);
      const targets = new Set<unknown>(children);
      const source = $.atom('active');
      const $children = $(children).atomText(source);
      await Promise.resolve();

      for (const node of removedChildren) node.remove();
      const contains = vi.spyOn(Node.prototype, 'contains');
      const getRootNode = vi.spyOn(Node.prototype, 'getRootNode');
      try {
        $children.detach();
        const unrelatedChecks = contains.mock.calls.filter(
          ([node], i) => targets.has(contains.mock.contexts[i]) && removed.has(node)
        );
        expect(unrelatedChecks.length).toBeLessThan(count * 2);
        expect(getRootNode.mock.contexts.filter((node) => removed.has(node)).length).toBeLessThan(
          count * 2
        );
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(count);
      } finally {
        getRootNode.mockRestore();
        contains.mockRestore();
        $children.atomUnbind();
      }
    });

    it('does not scan unrelated pending removals for each sibling that cannot host a shadow root', async () => {
      const parent = document.body.appendChild(document.createElement('ul'));
      const count = 32;
      const removed = Array.from({ length: count }, () =>
        parent.appendChild(document.createElement('li'))
      );
      const targets = Array.from({ length: count }, () =>
        parent.appendChild(document.createElement('li'))
      );
      const removedSet = new Set<unknown>(removed);
      const removedSource = $.atom('removed');
      const keptSource = $.atom('kept');
      $(removed).atomText(removedSource);
      const $targets = $(targets).atomText(keptSource);
      await $.nextTick();

      for (const node of removed) node.remove();
      const parentReads = vi.spyOn(Node.prototype, 'parentNode', 'get');
      try {
        $targets.detach();
        expect(parentReads.mock.contexts.filter((node) => removedSet.has(node))).toHaveLength(0);
      } finally {
        parentReads.mockRestore();
      }
      try {
        await $.nextTick();
        expect(removedSource.subscriberCount()).toBe(0);
        expect(keptSource.subscriberCount()).toBe(count);
      } finally {
        $targets.atomUnbind();
      }
    });

    it('preserves a parentless detach after native removal but not a later native removal', async () => {
      const parent = document.body.appendChild(document.createElement('section'));
      enableAutoCleanup(parent);
      const child = parent.appendChild(document.createElement('span'));
      const source = $.atom('attached');
      const $child = $(child).atomText(source);

      try {
        child.remove();
        $child.detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);

        source.value = 'detached';
        await $.nextTick();
        expect(child.textContent).toBe('detached');

        parent.appendChild(child);
        child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it('preserves .detach() bindings across overlapping roots but cleans up a later native removal', async () => {
      const root = document.createElement('section');
      appendToBody(root);
      enableAutoCleanup(root);
      const child = root.appendChild(document.createElement('span'));
      const source = $.atom('attached');
      const $child = $(child).atomText(source);

      try {
        $child.detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);

        // A later detach of the same node must also preserve its bindings.
        root.appendChild(child);
        $child.detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);

        source.value = 'detached';
        await $.nextTick();
        expect(child.textContent).toBe('detached');

        root.appendChild(child);
        child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it('cleans up a second removal in the same delivery after .detach() and reinsertion', async () => {
      const root = document.createElement('section');
      appendToBody(root);
      enableAutoCleanup(root);
      const child = root.appendChild(document.createElement('span'));
      const source = $.atom('attached');
      const $child = $(child).atomText(source);

      try {
        $child.detach();
        root.appendChild(child);
        child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it('cleans up a native removal from a different observed root after .detach()', async () => {
      $.initAEJ({ autoCleanup: false });
      const first = document.createElement('section');
      const second = document.createElement('section');
      appendToBody(first);
      appendToBody(second);
      enableAutoCleanup(first);
      enableAutoCleanup(second);
      const child = first.appendChild(document.createElement('span'));
      const source = $.atom('attached');
      const $child = $(child).atomText(source);

      try {
        $child.detach();
        second.appendChild(child);
        child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it('does not carry detach protection into an observed disconnected fragment', async () => {
      $.initAEJ({ autoCleanup: false });
      const fragment = document.createDocumentFragment();
      enableAutoCleanup(fragment);
      const outside = document.createElement('div');
      const child = outside.appendChild(document.createElement('span'));
      const source = $.atom('attached');
      const $child = $(child).atomText(source);

      try {
        $child.detach();
        fragment.appendChild(child);
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);

        child.remove();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $child.atomUnbind();
      }
    });

    it('still delivers removals to other subscribers when auto-cleanup protects a detach', async () => {
      const root = document.createElement('section');
      appendToBody(root);
      enableAutoCleanup(root);
      const native = root.appendChild(document.createElement('span'));
      const detached = root.appendChild(document.createElement('span'));
      const removed: Node[] = [];
      const unsubscribe = getOrCreateRootObserver(root).onNodeRemoved((node) => removed.push(node));

      try {
        native.remove();
        $(detached).detach();
        await Promise.resolve();
        expect(removed).toEqual([native, detached]);
      } finally {
        unsubscribe();
      }
    });

    it.each(['queued', 'delivering'] as const)(
      'preserves an earlier detach when auto-cleanup starts while its removal is %s',
      async (phase) => {
        $.initAEJ({ autoCleanup: false });
        const $form = appendToBody('<form><input name="field"></form>');
        const form = $form.get(0) as HTMLFormElement;
        const source = $.atom({ field: 'initial' });
        $form.atomForm(source);
        const $input = $form.find('input');
        const input = $input.get(0) as HTMLInputElement;
        const removed: Node[] = [];
        const unsubscribe = getOrCreateRootObserver(form).onNodeRemoved((node) => {
          if (removed.length === 0 && phase === 'delivering') enableAutoCleanup(form);
          removed.push(node);
        });
        try {
          $input.detach();
          if (phase === 'queued') enableAutoCleanup(form);
          await Promise.resolve();
          expect(removed).toEqual([input]);
          expect(source.subscriberCount()).toBe(1);
          source.value = { field: 'detached update' };
          await $.nextTick();
          expect(input.value).toBe('detached update');

          form.append(input);
          input.remove();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(0);
        } finally {
          unsubscribe();
          $form.atomUnbind();
        }
      }
    );

    it('delivers a pending native removal before a queued auto-cleanup disable', async () => {
      const source = $.atom('active');
      const native = document.createElement('span');
      const detached = document.createElement('span');
      const $native = appendToBody(native).atomText(source);
      const $detached = appendToBody(detached);
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(1);

      try {
        native.remove();
        const disabled = Promise.resolve().then(disableAutoCleanup);
        $detached.detach();
        await disabled;
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $native.atomUnbind();
      }
    });

    it('cleans up a native removal from a disconnected callback', async () => {
      let reinserted = false;
      customElements.define(
        'aej-remove-on-disconnect',
        class extends HTMLElement {
          disconnectedCallback(): void {
            if (reinserted) return;
            reinserted = true;
            document.body.appendChild(this);
            this.remove();
          }
        }
      );
      const source = $.atom('active');
      const $element = appendToBody(document.createElement('aej-remove-on-disconnect')).atomText(
        source
      );
      await Promise.resolve();
      expect(source.subscriberCount()).toBe(1);

      try {
        $element.detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(0);
      } finally {
        $element.atomUnbind();
      }
    });

    it('does not protect a later detach target removed natively by an earlier target', async () => {
      enableAutoCleanup(document.body.appendChild(document.createElement('section')));
      const later = document.createElement('span');
      customElements.define(
        'aej-remove-sibling-on-disconnect',
        class extends HTMLElement {
          disconnectedCallback(): void {
            later.remove();
          }
        }
      );
      const first = document.createElement('aej-remove-sibling-on-disconnect');
      const firstSource = $.atom('first');
      const laterSource = $.atom('later');
      appendToBody(first).atomText(firstSource);
      appendToBody(later).atomText(laterSource);
      const $targets = $([first, later]);
      await Promise.resolve();

      try {
        expect($targets.detach()).toBe($targets);
        expect(first.isConnected).toBe(false);
        expect(later.isConnected).toBe(false);
        await Promise.resolve();
        expect(firstSource.subscriberCount()).toBe(1);
        expect(laterSource.subscriberCount()).toBe(0);
      } finally {
        $targets.atomUnbind();
      }
    });

    it('preserves two .detach() calls delivered in the same observer batch', async () => {
      const child = document.createElement('span');
      appendToBody(child);
      const source = $.atom('attached');
      const $child = $(child).atomText(source);

      try {
        $child.detach();
        document.body.appendChild(child);
        $child.detach();
        await Promise.resolve();
        expect(source.subscriberCount()).toBe(1);
      } finally {
        $child.atomUnbind();
      }
    });

    it('should track and clean up elements added before body is ready', async () => {
      $.initAEJ({ autoCleanup: false }); // Reset

      const originalBody = document.body;
      const bodySpy = vi.spyOn(document, 'body', 'get').mockReturnValue(castTo<HTMLElement>(null));

      // Simulate early binding (e.g. in <head>)
      const stateAtom = $.atom('v1');
      const earlyEl = document.createElement('div');
      $(earlyEl).atomText(stateAtom);

      // Restore body and re-init
      bodySpy.mockReturnValue(originalBody);
      $.initAEJ({ autoCleanup: true });

      const $element = $('<span>').appendTo(document.body);
      await $.nextTick();
      $element.atomText(stateAtom);

      // Remove and verify cleanup
      $element[0]?.remove();
      await vi.waitFor(() => {
        stateAtom.value = 'v2';
        return $element.text() !== 'v2';
      });
    });

    it('should remove DOMContentLoaded listener after body is ready', async () => {
      // 1. Reset registry scheduled state
      registry.disableAutoCleanup();

      const originalBody = document.body;
      const bodySpy = vi.spyOn(document, 'body', 'get').mockReturnValue(castTo<HTMLElement>(null));

      // 2. Initialize with autoCleanup allowed, but body is null so it won't schedule immediately.
      $.initAEJ({ autoCleanup: true });

      const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
      const addListenerSpy = vi.spyOn(document, 'addEventListener');

      try {
        // Trigger binding before body is ready -> registers DOMContentLoaded listener
        const atom = $.atom('v1');
        const earlyEl = document.createElement('div');
        $(earlyEl).atomText(atom);

        expect(addListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

        // Capture the callback registered to DOMContentLoaded
        const domContentLoadedCallback = addListenerSpy.mock.calls.find(
          (call) => call[0] === 'DOMContentLoaded'
        )?.[1] as (() => void) | undefined;

        expect(domContentLoadedCallback).toBeDefined();

        // Now restore body and trigger the callback
        bodySpy.mockReturnValue(originalBody);

        if (domContentLoadedCallback) {
          domContentLoadedCallback();
        }

        // Verify removeEventListener was called to clean it up
        expect(removeListenerSpy).toHaveBeenCalledWith(
          'DOMContentLoaded',
          domContentLoadedCallback
        );
      } finally {
        // Clean up spies
        bodySpy.mockRestore();
        removeListenerSpy.mockRestore();
        addListenerSpy.mockRestore();
      }
    });

    it('should support automatic cleanup within Shadow DOM boundaries', async () => {
      const $host = $('<div>').appendTo(document.body);
      const shadow = $host[0]?.attachShadow({ mode: 'open' });
      if (!shadow) throw new Error('Shadow root not available');
      $.initAEJ({ autoCleanup: { root: shadow } });

      const atom = $.atom('active');
      const $child = $('<span>').appendTo(shadow);
      $child.atomText(atom);

      // 1. Cleanup host should reach into shadow
      cleanup($host);
      atom.value = 'dead';
      expect($child.text()).not.toBe('dead');

      // 2. Mutation cleanup in shadow
      const $child2 = $('<span>').appendTo(shadow);
      $child2.atomText(atom);
      $child2[0]?.remove();

      await vi.waitFor(() => {
        atom.value = 'final';
        return $child2.text() !== 'final';
      });
    });

    it('should verify that disabling autoCleanup prevents automatic disposal', async () => {
      const root = document.createElement('div');
      appendToBody(root);

      const atom = $.atom('v1');
      $.initAEJ({ autoCleanup: { root } });

      const $element = $('<span>').appendTo(root);
      $element.atomText(atom);

      // Disable system globally
      $.initAEJ({ autoCleanup: false });

      $element[0]?.remove();
      await $.nextTick();

      // Should still be reactive (leaked)
      atom.value = 'leaked';
      await $.nextTick();
      expect($element.text()).toBe('leaked');
    });

    it('should not disconnect active node addition observers when auto-cleanup is disabled', async () => {
      const root = document.createElement('div');
      appendToBody(root);

      // 1. Initialize auto-cleanup on root
      $.initAEJ({ autoCleanup: { root } });

      // 2. Register an unrelated addition observer on the same root
      const observer = getOrCreateRootObserver(root);
      const addedList: Element[] = [];
      const unsubscribeCallback = observer.onNodeAdded('.test-node', (element) => {
        addedList.push(element);
      });

      // 3. Disable auto-cleanup globally (this should only unsubscribe auto-cleanup)
      $.initAEJ({ autoCleanup: false });

      // 4. Verify that the RootObserver is still alive in the map
      expect(rootObserversMap.has(root)).toBe(true);

      // 5. Verify that addition callback still fires when target element is added
      const target = document.createElement('div');
      target.className = 'test-node';
      root.appendChild(target);

      await vi.waitFor(() => {
        return addedList.length > 0;
      });

      expect(addedList).toContain(target);

      // Cleanup
      unsubscribeCallback();
      expect(rootObserversMap.has(root)).toBe(false);
    });

    it('should schedule auto-cleanup when binding triggers and document.body is present', () => {
      registry.disableAutoCleanup();
      expect(registry.isAutoCleanupScheduled()).toBe(false);

      const $element = $('<div>');
      const atom = $.atom('test');
      $element.atomText(atom);

      expect(registry.isAutoCleanupScheduled()).toBe(true);
    });

    it('should clean up shadow DOM hosts that are descendants of the cleaned element', async () => {
      const $parent = $('<div>').appendTo(document.body);
      const $host = $('<div>').appendTo($parent);
      const hostEl = $host[0];
      if (!hostEl) throw new Error('Host element not found');
      const shadow = hostEl.attachShadow({ mode: 'open' });
      if (!shadow) throw new Error('Shadow root not available');

      // Register shadow DOM host
      registry.registerShadow(hostEl, shadow);
      registry.markHost(hostEl);

      const $child = $('<span>').appendTo(shadow);
      const atom = $.atom('v1');
      $child.atomText(atom);
      await $.nextTick();
      expect($child.text()).toBe('v1');

      // Clean up parent
      cleanup($parent);

      atom.value = 'v2';
      await $.nextTick();
      expect($child.text()).not.toBe('v2');
      $parent.remove();
    });

    it('should release ShadowRoot from rootObserversMap during cleanup', async () => {
      const $host = $('<div>').appendTo(document.body);
      const shadow = $host[0]?.attachShadow({ mode: 'open' });
      if (!shadow) throw new Error('Shadow root not available');
      $.initAEJ({ autoCleanup: { root: shadow } });

      expect(rootObserversMap.has(shadow)).toBe(true);

      cleanup($host);

      expect(rootObserversMap.has(shadow)).toBe(false);
      $host.remove();
    });

    it.each(['connected', 'already removed natively'])(
      'preserves replacement bindings after same-turn jQuery removal (%s)',
      async (state) => {
        const $el = $('<div>').appendTo(document.body);
        const atom1 = $.atom('first');
        $el.atomText(atom1);
        await $.nextTick();
        expect($el.text()).toBe('first');

        if (state === 'already removed natively') $el.get(0)?.remove();
        $el.remove();
        expect(atom1.subscriberCount()).toBe(0);

        const atom2 = $.atom('second');
        $el.atomText(atom2);
        await $.nextTick();
        expect($el.text()).toBe('second');

        atom2.value = 'second-updated';
        await $.nextTick();
        expect($el.text()).toBe('second-updated');
        $el.atomUnbind();
      }
    );

    it('cleans up non-HTML Elements like SVGElement via exported cleanup function', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      svg.appendChild(rect);
      document.body.appendChild(svg);

      const cleanupSpy = vi.spyOn(registry, 'cleanupTree');
      cleanup(svg as unknown as HTMLElement);
      expect(cleanupSpy).toHaveBeenCalledWith(svg);
      cleanupSpy.mockRestore();
      svg.remove();
    });

    it('preserves replacement binding after moving into an unobserved detached container and calling .remove()', async () => {
      const el = document.body.appendChild(document.createElement('span'));
      const parking = document.createElement('div');
      const atom1 = $.atom('first');
      const atom2 = $.atom('second');
      $(el).atomText(atom1);
      await $.nextTick();

      try {
        parking.appendChild(el);
        $(el).remove();
        expect(atom1.subscriberCount()).toBe(0);

        $(el).atomText(atom2);
        await Promise.resolve();
        expect(atom2.subscriberCount()).toBe(1);

        atom2.value = 'updated';
        await $.nextTick();
        expect(el.textContent).toBe('updated');
      } finally {
        $(el).atomUnbind();
      }
    });

    it('does not preserve moved descendants of a detached target during bulk .remove()', async () => {
      const first = document.body.appendChild(document.createElement('div'));
      const parent = document.createElement('section');
      const child = document.body.appendChild(document.createElement('span'));
      const source = $.atom('active');
      $(child).atomText(source);
      $(first).atomMount(() => () => {
        child.remove();
      });
      await $.nextTick();

      try {
        parent.appendChild(child);
        parent.remove();
        $([first, parent]).remove();
        await Promise.resolve();

        expect(source.subscriberCount()).toBe(0);
      } finally {
        $(child).atomUnbind();
      }
    });

    it('handles forms whose named controls clobber localName, isConnected, and nodeType', async () => {
      const localOnlyForm = document.body.appendChild(document.createElement('form'));
      localOnlyForm.appendChild(document.createElement('input')).name = 'localName';
      const localOnlySource = $.atom('local');
      registry.trackEffect(
        localOnlyForm,
        $.effect(() => {
          localOnlySource.value;
        })
      );

      const form = document.body.appendChild(document.createElement('form'));
      for (const name of ['localName', 'isConnected', 'nodeType']) {
        form.appendChild(document.createElement('input')).name = name;
      }
      const child = form.appendChild(document.createElement('span'));
      const formSource = $.atom('form');
      const childSource = $.atom('child');
      registry.trackEffect(
        form,
        $.effect(() => {
          formSource.value;
        })
      );
      $(child).atomText(childSource);

      const manualForm = document.body.appendChild(document.createElement('form'));
      for (const name of ['localName', 'isConnected', 'nodeType']) {
        manualForm.appendChild(document.createElement('input')).name = name;
      }
      const manualChild = manualForm.appendChild(document.createElement('span'));
      const manualFormSource = $.atom('manual-form');
      const manualChildSource = $.atom('manual-child');
      registry.trackEffect(
        manualForm,
        $.effect(() => {
          manualFormSource.value;
        })
      );
      $(manualChild).atomText(manualChildSource);
      await $.nextTick();

      try {
        document.body.appendChild(document.createElement('span')).remove();
        expect(() => $(localOnlyForm).detach()).not.toThrow();
        await Promise.resolve();
        expect(localOnlySource.subscriberCount()).toBe(1);

        document.body.appendChild(document.createElement('span')).remove();
        expect(() => $(form).detach()).not.toThrow();
        await Promise.resolve();
        expect(formSource.subscriberCount()).toBe(1);
        expect(childSource.subscriberCount()).toBe(1);

        document.body.appendChild(form);
        form.remove();
        await Promise.resolve();
        expect(registry.hasBind(form)).toBe(false);
        expect(formSource.subscriberCount()).toBe(0);
        expect(childSource.subscriberCount()).toBe(0);

        cleanup(manualForm);
        expect(registry.hasBind(manualForm)).toBe(false);
        expect(manualFormSource.subscriberCount()).toBe(0);
        expect(manualChildSource.subscriberCount()).toBe(0);
      } finally {
        registry.cleanupTree(localOnlyForm);
        registry.cleanupTree(form);
        registry.cleanupTree(manualForm);
      }
    });

    it('preserves bindings on preserveDuringRemoval and wrapper .detach() when a named control clobbers parentNode', async () => {
      const form = document.body.appendChild(document.createElement('form'));
      const input = form.appendChild(document.createElement('input'));
      input.name = 'parentNode';
      const model = $.atom({ parentNode: 'initial' });
      $(form).atomForm(model);

      const wrapper = document.body.appendChild(document.createElement('div'));
      const wrappedForm = wrapper.appendChild(document.createElement('form'));
      const wrappedInput = wrappedForm.appendChild(document.createElement('input'));
      wrappedInput.name = 'parentNode';
      const wrappedModel = $.atom({ parentNode: 'wrapped' });
      $(wrappedForm).atomForm(wrappedModel);
      await $.nextTick();

      try {
        registry.preserveDuringRemoval(form, () => form.remove(), true);
        await Promise.resolve();
        expect(model.subscriberCount()).toBe(1);

        model.value = { parentNode: 'updated' };
        await $.nextTick();
        expect(input.value).toBe('updated');

        document.body.appendChild(form);
        form.remove();
        await Promise.resolve();
        expect(model.subscriberCount()).toBe(0);

        $(wrapper).detach();
        await Promise.resolve();
        expect(wrappedModel.subscriberCount()).toBe(1);

        wrappedModel.value = { parentNode: 'wrapped-updated' };
        await $.nextTick();
        expect(wrappedInput.value).toBe('wrapped-updated');

        document.body.appendChild(wrapper);
        wrapper.remove();
        await Promise.resolve();
        expect(wrappedModel.subscriberCount()).toBe(0);
      } finally {
        registry.cleanupTree(form);
        registry.cleanupTree(wrapper);
      }
    });

    it('preserves destination removal roots when a form-associated custom element moves forms re-entrantly during onCleanup', async () => {
      $.initAEJ({ autoCleanup: false });
      const tagName = 'aej-reentrant-form-control';
      let nextForm: HTMLFormElement | undefined;
      let nextModel: ReturnType<typeof $.atom<{ field: string }>> | undefined;
      if (!customElements.get(tagName)) {
        customElements.define(
          tagName,
          class extends HTMLElement {
            static formAssociated = true;
            static observedAttributes = ['class'];
            value = '';

            constructor() {
              super();
              this.attachInternals();
            }

            attributeChangedCallback(
              name: string,
              _previous: string | null,
              current: string | null
            ): void {
              if (
                name === 'class' &&
                current?.split(/\s+/).includes('_aes-bound') &&
                nextForm &&
                nextModel
              ) {
                const targetForm = nextForm;
                const targetModel = nextModel;
                nextForm = undefined;
                nextModel = undefined;
                targetForm.appendChild(this);
                $(targetForm).atomForm(targetModel);
              }
            }
          }
        );
      }

      const formA = document.body.appendChild(document.createElement('form'));
      const formB = document.body.appendChild(document.createElement('form'));
      const control = formA.appendChild(document.createElement(tagName)) as HTMLElement & {
        value: string;
      };
      control.setAttribute('name', 'field');
      const modelA = $.atom({ field: 'fromA' });
      const modelB = $.atom({ field: 'fromB' });
      nextForm = formB;
      nextModel = modelB;

      try {
        $(formA).atomForm(modelA);
        await $.nextTick();
        expect(control.parentNode).toBe(formB);
        expect(modelA.subscriberCount()).toBe(0);
        expect(modelB.subscriberCount()).toBe(1);

        control.remove();
        $(control).detach();
        await Promise.resolve();
        expect(modelB.subscriberCount()).toBe(1);

        modelB.value = { field: 'detachedB' };
        await $.nextTick();
        expect(control.value).toBe('detachedB');

        formB.appendChild(control);
        control.remove();
        await Promise.resolve();
        expect(modelB.subscriberCount()).toBe(0);
      } finally {
        nextForm = undefined;
        nextModel = undefined;
        $(formA).atomUnbind();
        $(formB).atomUnbind();
        $(control).atomUnbind();
      }
    });

    it.each(['open', 'closed'] as const)(
      'preserves bindings on native move into a %s shadow root inside a detached observed root until host removal',
      async (mode) => {
        $.initAEJ({ autoCleanup: false });
        const root = document.createElement('section');
        enableAutoCleanup(root);
        const host = root.appendChild(document.createElement('div'));
        const shadow = host.attachShadow({ mode });
        const child = root.appendChild(document.createElement('span'));
        const source = $.atom('bound');
        $(child).atomText(source);

        try {
          shadow.appendChild(child);
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(1);

          source.value = 'updated';
          await $.nextTick();
          expect(child.textContent).toBe('updated');

          host.remove();
          await Promise.resolve();
          expect(source.subscriberCount()).toBe(0);
        } finally {
          $(child).atomUnbind();
        }
      }
    );

    it.each(['direct host', 'unmarked ancestor'] as const)(
      'preserves form binding when a bound control moves natively into an open shadow root before .detach() (%s)',
      async (mode) => {
        const form = document.createElement('form');
        const input = form.appendChild(document.createElement('input'));
        input.name = 'field';
        const model = $.atom({ field: 'initial' });
        $(form).atomForm(model);
        await $.nextTick();

        const container = document.createElement('div');
        const wrapper =
          mode === 'unmarked ancestor'
            ? container.appendChild(document.createElement('div'))
            : undefined;
        const host = (wrapper ?? container).appendChild(document.createElement('div'));
        const shadow = host.attachShadow({ mode: 'open' });
        const detachTarget = wrapper ?? host;

        try {
          shadow.appendChild(input);
          $(detachTarget).detach();
          await Promise.resolve();

          expect(model.subscriberCount()).toBe(1);
          model.value = { field: 'updated' };
          await $.nextTick();
          expect(input.value).toBe('updated');

          document.body.appendChild(detachTarget);
          detachTarget.remove();
          await Promise.resolve();
          expect(model.subscriberCount()).toBe(0);
        } finally {
          $(form).atomUnbind();
          $(detachTarget).atomUnbind();
        }
      }
    );
  });
});
