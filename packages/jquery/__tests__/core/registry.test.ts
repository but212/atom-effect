import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '@/core/registry';
import $, { cleanup, disableAutoCleanup } from '@/index';

describe('Binding Registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Cleanup Lifecycle (Manual)', () => {
    it('should be atomic and idempotent when removing marker classes', async () => {
      const $el = $('<div class="_aes-bound"></div>');

      // 1. Unregistered element should just have its class removed
      cleanup($el);
      expect($el.hasClass('_aes-bound')).toBe(false);

      // 2. Active binding should be disposed and class removed
      const atom = $.atom('initial');
      $el.atomText(atom);
      await $.nextTick();
      expect($el.hasClass('_aes-bound')).toBe(true);

      cleanup($el);
      expect($el.hasClass('_aes-bound')).toBe(false);

      // Verify reactivity is terminated
      atom.value = 'updated';
      expect($el.text()).not.toBe('updated');
    });

    it('should continue cleaning up even if individual disposals fail', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const $el = $('<div>').appendTo(document.body);

      // Register multiple features, one of which throws during cleanup
      $el.atomText($.atom('test'));
      $el.atomMount(() => () => {
        throw new Error('cleanup error');
      });

      cleanup($el);

      expect(errorSpy).toHaveBeenCalled();
      expect($el.hasClass('_aes-bound')).toBe(false);
      errorSpy.mockRestore();
    });

    it('should support manual cleanup with raw HTMLElement', async () => {
      const el = document.createElement('div');
      const atom = $.atom('initial');
      $(el).atomText(atom);
      await $.nextTick();
      expect(el.textContent).toBe('initial');

      // Call cleanup with raw HTMLElement
      cleanup(el);
      atom.value = 'updated';
      await $.nextTick();
      expect(el.textContent).not.toBe('updated');
    });

    it('should log registry.trackEffect throws', () => {
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      $.debug.enabled = true;
      const el = document.createElement('div');
      const mockEffect = {
        dispose: () => {
          throw new Error('dispose failed');
        },
      } as unknown as Parameters<typeof registry.trackEffect>[1];
      registry.trackEffect(el, mockEffect);
      registry.cleanup(el);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should log registry.onCleanup throws', () => {
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      $.debug.enabled = true;
      const el = document.createElement('div');
      registry.onCleanup(el, () => {
        throw new Error('cleanup failed');
      });
      registry.cleanup(el);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should correctly support registry.hasBind check', () => {
      const el = document.createElement('div');
      expect(registry.hasBind(el)).toBe(false);
      $(el).atomText($.atom('test'));
      expect(registry.hasBind(el)).toBe(true);
      registry.cleanup(el);
    });

    it('should support markIgnored and unmarkIgnored', () => {
      const el = document.createElement('div');
      registry.markIgnored(el);
      expect(registry.isIgnored(el)).toBe(true);
      registry.unmarkIgnored(el);
      expect(registry.isIgnored(el)).toBe(false);
    });
  });

  describe('Auto-Cleanup System (MutationObserver)', () => {
    it('should track and clean up elements added before body is ready', async () => {
      $.initAEJ({ autoCleanup: false }); // Reset

      const originalBody = document.body;
      const bodySpy = vi
        .spyOn(document, 'body', 'get')
        .mockReturnValue(null as unknown as HTMLElement);

      // Simulate early binding (e.g. in <head>)
      const atom = $.atom('v1');
      const earlyEl = document.createElement('div');
      $(earlyEl).atomText(atom);

      // Restore body and re-init
      bodySpy.mockReturnValue(originalBody);
      $.initAEJ({ autoCleanup: true });

      const $el = $('<span>').appendTo(document.body);
      await $.nextTick();
      $el.atomText(atom);

      // Remove and verify cleanup
      $el[0]?.remove();
      await vi.waitFor(() => {
        atom.value = 'v2';
        return $el.text() !== 'v2';
      });
    });

    it('should remove DOMContentLoaded listener after body is ready', async () => {
      // 1. Reset registry scheduled state
      disableAutoCleanup();

      const originalBody = document.body;
      const bodySpy = vi
        .spyOn(document, 'body', 'get')
        .mockReturnValue(null as unknown as HTMLElement);

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
      const $child = $('<span>').appendTo(shadow as unknown as HTMLElement);
      $child.atomText(atom);

      // 1. Cleanup host should reach into shadow
      cleanup($host);
      atom.value = 'dead';
      expect($child.text()).not.toBe('dead');

      // 2. Mutation cleanup in shadow
      const $child2 = $('<span>').appendTo(shadow as unknown as HTMLElement);
      $child2.atomText(atom);
      $child2[0]?.remove();

      await vi.waitFor(() => {
        atom.value = 'final';
        return $child2.text() !== 'final';
      });
    });

    it('should verify that disabling autoCleanup prevents automatic disposal', async () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const atom = $.atom('v1');
      $.initAEJ({ autoCleanup: { root } });

      const $el = $('<span>').appendTo(root);
      $el.atomText(atom);

      // Disable system globally
      $.initAEJ({ autoCleanup: false });

      $el[0]?.remove();
      await $.nextTick();

      // Should still be reactive (leaked)
      atom.value = 'leaked';
      await $.nextTick();
      expect($el.text()).toBe('leaked');
    });

    it('should not disconnect active node addition observers when disableAutoCleanup is called', async () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      // 1. Initialize auto-cleanup on root
      $.initAEJ({ autoCleanup: { root } });

      // 2. Register an unrelated addition observer on the same root
      const { getOrCreateRootObserver } = await import('@/core/observer');
      const observer = getOrCreateRootObserver(root);
      const addedList: Element[] = [];
      const unsub = observer.onNodeAdded('.test-node', (el) => {
        addedList.push(el);
      });

      // 3. Disable auto-cleanup globally (this should only unsubscribe auto-cleanup)
      $.initAEJ({ autoCleanup: false });

      // 4. Verify that the RootObserver is still alive in the map
      const { rootObserversMap } = await import('@/core/observer');
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
      unsub();
      expect(rootObserversMap.has(root)).toBe(false);
    });

    it('should schedule auto-cleanup when binding triggers and document.body is present', () => {
      disableAutoCleanup();
      expect(registry.isAutoCleanupScheduled()).toBe(false);

      const $el = $('<div>');
      const atom = $.atom('test');
      $el.atomText(atom);

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

      const $child = $('<span>').appendTo(shadow as unknown as DocumentFragment);
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
  });
});
