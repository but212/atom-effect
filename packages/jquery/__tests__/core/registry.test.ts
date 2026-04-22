import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import {
  disableAutoCleanup,
  enableAutoCleanup,
  registry,
  setAutoCleanupScheduled,
} from '@/core/registry';

describe('Binding Registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
  });

  describe('Cleanup Lifecycle', () => {
    it('should be atomic and idempotent (removes marker class always)', () => {
      const $el = $('<div class="_aes-bound"></div>');

      // 1. Unregistered element
      registry.cleanup($el[0]!);
      expect($el.hasClass('_aes-bound')).toBe(false);

      // 2. Fragmented/Detached element
      registry.onCleanup($el[0]!, () => {});
      registry.cleanup($el[0]!);
      expect(registry.hasBind($el[0]!)).toBe(false);
      expect($el.hasClass('_aes-bound')).toBe(false);
    });

    it('should handle errors gracefully during all cleanup phases', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const el = document.createElement('div');
      $.debug.enabled = true;

      registry.trackEffect(el, {
        dispose: () => {
          throw new Error('dispose fail');
        },
        // [Symbol.dispose]() {
        //   this.dispose();
        // },
        run: () => {},
        isDisposed: false,
        isExecuting: false,
        executionCount: 0,
      });
      registry.onCleanup(el, () => {
        throw new Error('cleanup fail');
      });
      registry.setTeardown(el, () => {
        throw new Error('mount cleanup fail');
      });

      registry.cleanup(el);
      // Expected 3 errors: componentCleanup, effects, cleanups
      expect(errorSpy).toHaveBeenCalledTimes(3);
      errorSpy.mockRestore();
    });
  });

  describe('Auto-Cleanup System', () => {
    it('should respect boundaries regardless of initialization timing (Body Readiness)', async () => {
      // Ensure: system works even if first call happens before body is ready
      disableAutoCleanup();
      setAutoCleanupScheduled(false);

      const originalBody = document.body;
      const bodySpy = vi
        .spyOn(document, 'body', 'get')
        .mockReturnValue(null as unknown as HTMLElement);

      // Trigger first binding check (head/early script simulation)
      registry.onCleanup(document.createElement('div'), () => {});

      bodySpy.mockReturnValue(originalBody);

      const $el = $('<span>').appendTo(document.body);
      const cleanup = vi.fn();
      registry.onCleanup($el[0]!, cleanup);

      $el[0]!.remove();
      await new Promise((r) => setTimeout(r, 100));

      expect(cleanup).toHaveBeenCalled();
    });

    it('should support various container types including Shadow DOM', async () => {
      const $host = $('<div>').appendTo(document.body);
      const shadow = $host[0]!.attachShadow({ mode: 'open' });
      enableAutoCleanup(shadow);

      let cleanupCount = 0;
      const cleanup = () => {
        cleanupCount++;
      };

      const $child1 = $('<span>').appendTo(shadow as unknown as HTMLElement);
      registry.onCleanup($child1[0]!, cleanup);

      // 1. Manual subtree cleanup check
      registry.cleanupTree(shadow);
      expect(cleanupCount).toBe(1);

      // 2. Mutation-based auto cleanup check
      const $child2 = $('<span>').appendTo(shadow as unknown as HTMLElement);
      registry.onCleanup($child2[0]!, cleanup);
      $child2[0]!.remove();

      await new Promise((r) => setTimeout(r, 100));
      expect(cleanupCount).toBe(2);
    });

    it('should allow multiple roots and handle global disable', async () => {
      const root1 = document.createElement('div');
      const root2 = document.createElement('div');
      document.body.appendChild(root1);
      document.body.appendChild(root2);

      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      enableAutoCleanup(root1);
      enableAutoCleanup(root2);

      const $el1 = $('<span>').appendTo(root1);
      const $el2 = $('<span>').appendTo(root2);

      registry.onCleanup($el1[0]!, cleanup1);
      registry.onCleanup($el2[0]!, cleanup2);

      disableAutoCleanup();

      $el1[0]!.remove();
      $el2[0]!.remove();

      await new Promise((r) => setTimeout(r, 100));

      expect(cleanup1).not.toHaveBeenCalled();
      expect(cleanup2).not.toHaveBeenCalled();
    });
  });
});
