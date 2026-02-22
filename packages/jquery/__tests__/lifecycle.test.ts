import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index'; // Register plugins
import { atom } from '@but212/atom-effect';
import { enablejQueryOverrides } from '../src/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '../src/registry';

describe('jQuery Lifecycle Overrides', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enablejQueryOverrides();
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
  });

  describe('DOM Removal & Cleanup', () => {
    it('should clean up bindings on .remove() and be idempotent', () => {
      const $el = $('<div></div>').appendTo(document.body);
      const text = atom('hello');
      $el.atomText(text);

      expect(registry.hasBind($el[0]!)).toBe(true);

      $el.remove();
      expect(registry.hasBind($el[0]!)).toBe(false);

      // Second remove should not throw (idempotent)
      $el.remove();
    });

    it('should clean up children bindings on .empty()', () => {
      const $parent = $('<div></div>').appendTo(document.body);
      const $child = $('<span></span>').appendTo($parent);
      const text = atom('hello');
      $child.atomText(text);

      expect(registry.hasBind($child[0]!)).toBe(true);

      $parent.empty();

      expect(registry.hasBind($child[0]!)).toBe(false);
      expect($parent[0]!.hasChildNodes()).toBe(false);
    });

    it('should preserve bindings on .detach() and restore on re-attach', async () => {
      const $el = $('<div></div>').appendTo(document.body);
      const text = atom('hello');
      $el.atomText(text);

      expect(registry.hasBind($el[0]!)).toBe(true);

      const $detached = $el.detach();
      await new Promise((r) => setTimeout(r, 0));

      // Bindings preserved while detached
      expect(registry.hasBind($el[0]!)).toBe(true);
      expect(document.body.contains($el[0]!)).toBe(false);

      // Reactivity works in memory
      text.value = 'world';
      await new Promise((r) => setTimeout(r, 0));
      expect($el.text()).toBe('world');

      // Re-attach
      $detached.appendTo(document.body);
      await new Promise((r) => setTimeout(r, 0));

      text.value = 'again';
      await new Promise((r) => setTimeout(r, 0));
      expect($el.text()).toBe('again');

      // Detach then remove: cleanup happens on remove
      $el.detach();
      expect(registry.hasBind($el[0]!)).toBe(true);
      $el.remove();
      expect(registry.hasBind($el[0]!)).toBe(false);
    });

    it('should support selectors in remove and detach', () => {
      const $parent = $('<div>').appendTo(document.body);
      const $child1 = $('<div class="a">').appendTo($parent);
      const $child2 = $('<div class="b">').appendTo($parent);

      registry.trackCleanup($child1[0]!, () => {});
      registry.trackCleanup($child2[0]!, () => {});

      // remove with selector
      $parent.children().remove('.a');
      expect(registry.hasBind($child1[0]!)).toBe(false);
      expect(registry.hasBind($child2[0]!)).toBe(true);

      // detach with selector
      $parent.children().detach('.b');
      expect(registry.isKept($child2[0]!)).toBe(true);

      $parent.remove();
    });
  });

  describe('Registry', () => {
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
  });

  describe('Event Patching', () => {
    it('should support on/off cycle', () => {
      const $el = $('<div>');
      const handler = vi.fn();

      $el.on('click', handler);
      $el.trigger('click');
      expect(handler).toHaveBeenCalledTimes(1);

      $el.off('click', handler);
      $el.trigger('click');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should batch updates inside jQuery events', async () => {
      const count = atom(0);
      let computeCount = 0;

      $.effect(() => {
        const _val = count.value;
        computeCount++;
        return undefined;
      });

      computeCount = 0;
      const $btn = $('<button>').appendTo(document.body);

      $btn.on('click', () => {
        count.value++;
        count.value++;
      });

      $btn.trigger('click');
      await $.nextTick();

      expect(computeCount).toBe(1);
      expect(count.value).toBe(2);
      $btn.remove();
    });

  });

  describe('Atom Mount', () => {
    it('should mount and unmount components with cleanup', () => {
      const $el = $('<div>').appendTo(document.body);
      const cleanup = vi.fn();

      const Component = (el: JQuery) => {
        el.text('mounted');
        return cleanup;
      };

      $el.atomMount(Component);
      expect($el.text()).toBe('mounted');

      $el.atomUnmount();
      expect(cleanup).toHaveBeenCalled();

      $el.remove();
    });

    it('should unmount existing component when mounting a new one', () => {
      const $el = $('<div>').appendTo(document.body);
      const cleanup1 = vi.fn();

      $el.atomMount(() => {
        cleanup1();
        return undefined;
      });
      $el.atomMount(() => undefined);

      expect(cleanup1).toHaveBeenCalled();

      $el.remove();
    });

    it('should handle errors in component function', () => {
      const $el = $('<div>').appendTo(document.body);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      $el.atomMount(() => {
        throw new Error('mount fail');
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[atom-mount] Mount error'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
      $el.remove();
    });

    it('should log console.error when userCleanup throws', () => {
      const $el = $('<div>').appendTo(document.body);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      $el.atomMount(() => {
        return () => {
          throw new Error('user cleanup error');
        };
      });

      $el.atomUnmount();

      // Lines 43-49: userCleanup error triggers console.error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[atom-mount] Cleanup error'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
      $el.remove();
    });

    it('double atomUnmount() only runs cleanup once', () => {
      const $el = $('<div>').appendTo(document.body);
      const cleanup = vi.fn();

      $el.atomMount(() => cleanup);

      // First unmount: runs cleanup
      $el.atomUnmount();
      expect(cleanup).toHaveBeenCalledTimes(1);

      // Second unmount: guard via mountedComponents.delete() returns false (lines 38-39)
      $el.atomUnmount();
      expect(cleanup).toHaveBeenCalledTimes(1);

      $el.remove();
    });
  });
});
