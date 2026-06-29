import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateRootObserver, rootObserversMap } from '@/core/observer';
import { registry } from '@/core/registry';
import $, { cleanup, disableAutoCleanup } from '@/index';
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

    it('should support markIgnored and unmarkIgnored', () => {
      const element = document.createElement('div');
      registry.markIgnored(element);
      expect(registry.isIgnored(element)).toBe(true);
      registry.unmarkIgnored(element);
      expect(registry.isIgnored(element)).toBe(false);
    });
  });

  describe('Auto-Cleanup System (MutationObserver)', () => {
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
      disableAutoCleanup();

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

    it('should not disconnect active node addition observers when disableAutoCleanup is called', async () => {
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
      disableAutoCleanup();
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
  });
});
