import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/index';
import { disableAutoCleanup, enableAutoCleanup, registry } from '../../src/core/registry';

describe('Binding Registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
  });

  describe('Core Behavior', () => {
    it('should remove AES_BOUND class even if element is detached during cleanup (Zombie DOM)', () => {
      const $el = $('<div class="_aes-bound"></div>');
      // Manually add to registry
      registry.trackCleanup($el[0]!, () => {});

      expect($el.hasClass('_aes-bound')).toBe(true);
      expect(registry.hasBind($el[0]!)).toBe(true);

      // Element is NOT in document (disconnected)
      expect($el[0]!.isConnected).toBe(false);

      registry.cleanup($el[0]!);

      expect(registry.hasBind($el[0]!)).toBe(false);
      expect($el.hasClass('_aes-bound')).toBe(false);
    });

    it('should remove AES_BOUND class on cleanup call for already-unregistered elements', () => {
      const $el = $('<div class="_aes-bound"></div>');
      expect(registry.hasBind($el[0]!)).toBe(false);

      registry.cleanup($el[0]!);
      expect($el.hasClass('_aes-bound')).toBe(false);
    });

    it('should support manual cleanupTree on a ShadowRoot', () => {
      const $host = $('<div>').appendTo(document.body);
      const shadow = $host[0]!.attachShadow({ mode: 'open' });
      const $child = $('<span>').appendTo(shadow as unknown as HTMLElement);

      const cleanup = vi.fn();
      registry.trackCleanup($child[0]!, cleanup);

      expect(registry.hasBind($child[0]!)).toBe(true);
      expect($child.hasClass('_aes-bound')).toBe(true);

      // registry.cleanupTree(shadow) works via polyfilled/fallback querySelectorAll
      registry.cleanupTree(shadow);

      expect(registry.hasBind($child[0]!)).toBe(false);
      expect($child.hasClass('_aes-bound')).toBe(false);
      expect(cleanup).toHaveBeenCalled();
    });

    it('should handle errors during dispose and cleanup', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const el = document.createElement('div');
      $.atom.debug = true;

      // Dispose error
      registry.trackEffect(el, {
        dispose: () => {
          throw new Error('dispose fail');
        },
        run: () => {},
        isDisposed: false,
        isExecuting: false,
        executionCount: 0,
      });

      registry.cleanup(el);
      expect(errorSpy).toHaveBeenCalled();

      // Cleanup error
      registry.trackCleanup(el, () => {
        throw new Error('cleanup fail');
      });
      registry.cleanup(el);
      expect(errorSpy).toHaveBeenCalledTimes(2);

      errorSpy.mockRestore();
    });

    it('should initialize records with monomorphic shape (all keys undefined)', () => {
      const el = document.createElement('div');
      registry.trackCleanup(el, () => {});

      const internals = registry as unknown as {
        records: WeakMap<Element, Record<string, unknown>>;
      };
      const record = internals.records.get(el)!;
      expect('effects' in record).toBe(true);
      expect('cleanups' in record).toBe(true);
      expect('componentCleanup' in record).toBe(true);
      expect(record.cleanups).toBeDefined();
      expect(record.effects).toBe(undefined);
      expect(record.componentCleanup).toBe(undefined);
    });
  });

  describe('Auto-Cleanup (MutationObserver)', () => {
    it('should allow multiple roots to be observed concurrently', async () => {
      const root1 = document.createElement('div');
      const root2 = document.createElement('div');
      document.body.appendChild(root1);
      document.body.appendChild(root2);

      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      enableAutoCleanup(root1);
      enableAutoCleanup(root2);

      const $el1 = $('<span class="child1"></span>').appendTo(root1);
      const $el2 = $('<span class="child2"></span>').appendTo(root2);

      registry.trackCleanup($el1[0]!, cleanup1);
      registry.trackCleanup($el2[0]!, cleanup2);

      // Use native remove to trigger MutationObserver (not the jQuery patch)
      $el1[0]!.remove();
      $el2[0]!.remove();

      await new Promise((r) => setTimeout(r, 50));

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });

    it('disableAutoCleanup stops all observers', async () => {
      const root1 = document.createElement('div');
      document.body.appendChild(root1);

      enableAutoCleanup(root1);
      disableAutoCleanup();

      const cleanup = vi.fn();
      const $el = $('<span>').appendTo(root1);
      registry.trackCleanup($el[0]!, cleanup);

      // Use native remove to bypass sync jQuery patch
      $el[0]!.remove();
      await new Promise((r) => setTimeout(r, 50));

      expect(cleanup).not.toHaveBeenCalled();
    });
  });
});
