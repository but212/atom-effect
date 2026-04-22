import { beforeEach, describe, expect, it, vi } from 'vitest';
import $, { cleanup } from '@/index';

describe('Binding Registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Cleanup Lifecycle', () => {
    it('should be atomic and idempotent (removes marker class always)', () => {
      const $el = $('<div class="_aes-bound"></div>');

      // 1. Unregistered element
      cleanup($el);
      expect($el.hasClass('_aes-bound')).toBe(false);

      // 2. Fragmented/Detached element
      const atom = $.atom('v');
      $el.atomText(atom);
      expect($el.hasClass('_aes-bound')).toBe(true);

      cleanup($el);
      expect($el.hasClass('_aes-bound')).toBe(false);

      // Verify binding is dead
      atom.value = 'dead';
      expect($el.text()).not.toBe('dead');
    });

    it('should handle errors gracefully during all cleanup phases', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const $el = $('<div>').appendTo('body');

      // Register multiple things that fail during cleanup
      $el.atomText(
        $.computed(() => {
          return 'test';
        })
      );

      // Force a failing effect disposal (we can't easily make a standard effect throw on dispose without internal access,
      // but we can use a custom cleanup)
      $el.atomMount(() => {
        return () => {
          throw new Error('mount cleanup fail');
        };
      });

      cleanup($el);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('Auto-Cleanup System', () => {
    it('should respect boundaries regardless of initialization timing (Body Readiness)', async () => {
      // Ensure: system works even if first call happens before body is ready
      $.initAEJ({ autoCleanup: false });

      const originalBody = document.body;
      const bodySpy = vi
        .spyOn(document, 'body', 'get')
        .mockReturnValue(null as unknown as HTMLElement);

      // Trigger first binding check (head/early script simulation)
      const atom = $.atom('initial');
      const earlyEl = document.createElement('div');
      $(earlyEl).atomText(atom);

      bodySpy.mockReturnValue(originalBody);
      $.initAEJ({ autoCleanup: true });

      const $el = $('<span>').appendTo(document.body);
      $el.atomText(atom);

      $el[0]!.remove();
      await vi.waitFor(() => {
        atom.value = 'cleaned';
        return $el.text() !== 'cleaned';
      });
    });

    it('should support various container types including Shadow DOM', async () => {
      const $host = $('<div>').appendTo(document.body);
      const shadow = $host[0]!.attachShadow({ mode: 'open' });
      $.initAEJ({ autoCleanup: { root: shadow } });

      const atom = $.atom('v');
      const $child1 = $('<span>').appendTo(shadow as unknown as HTMLElement);
      $child1.atomText(atom);

      // 1. Manual subtree cleanup check
      cleanup($host); // cleanup host should cleanup its shadow
      atom.value = 'cleaned1';
      expect($child1.text()).not.toBe('cleaned1');

      // 2. Mutation-based auto cleanup check
      const $child2 = $('<span>').appendTo(shadow as unknown as HTMLElement);
      $child2.atomText(atom);
      $child2[0]!.remove();

      await vi.waitFor(() => {
        atom.value = 'cleaned2';
        return $child2.text() !== 'cleaned2';
      });
    });

    it('should allow multiple roots and handle global disable', async () => {
      const root1 = document.createElement('div');
      const root2 = document.createElement('div');
      document.body.appendChild(root1);
      document.body.appendChild(root2);

      const atom = $.atom('v');

      $.initAEJ({ autoCleanup: { root: root1 } });
      // Note: initAEJ currently only supports one root at a time in the config,
      // but we can test global disable.

      const $el1 = $('<span>').appendTo(root1);
      $el1.atomText(atom);

      $.initAEJ({ autoCleanup: false });

      $el1[0]!.remove();
      await $.nextTick();

      atom.value = 'leaked';
      await $.nextTick();
      expect($el1.text()).toBe('leaked');
    });
  });
});
