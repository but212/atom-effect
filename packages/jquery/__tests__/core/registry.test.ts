import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  });
});
