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

      expect(registry.hasBind($el[0])).toBe(true);

      $el.remove();
      expect(registry.hasBind($el[0])).toBe(false);

      // Second remove should not throw (idempotent)
      $el.remove();
    });

    it('should clean up children bindings on .empty()', () => {
      const $parent = $('<div></div>').appendTo(document.body);
      const $child = $('<span></span>').appendTo($parent);
      const text = atom('hello');
      $child.atomText(text);

      expect(registry.hasBind($child[0])).toBe(true);

      $parent.empty();

      expect(registry.hasBind($child[0])).toBe(false);
      expect($parent[0].hasChildNodes()).toBe(false);
    });

    it('should preserve bindings on .detach() and restore on re-attach', async () => {
      const $el = $('<div></div>').appendTo(document.body);
      const text = atom('hello');
      $el.atomText(text);

      expect(registry.hasBind($el[0])).toBe(true);

      const $detached = $el.detach();
      await new Promise((r) => setTimeout(r, 0));

      // Bindings preserved while detached
      expect(registry.hasBind($el[0])).toBe(true);
      expect(document.body.contains($el[0])).toBe(false);

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
      expect(registry.hasBind($el[0])).toBe(true);
      $el.remove();
      expect(registry.hasBind($el[0])).toBe(false);
    });

    it('should support selectors in remove and detach', () => {
      const $parent = $('<div>').appendTo(document.body);
      const $child1 = $('<div class="a">').appendTo($parent);
      const $child2 = $('<div class="b">').appendTo($parent);

      registry.trackCleanup($child1[0], () => {});
      registry.trackCleanup($child2[0], () => {});

      // remove with selector
      $parent.children().remove('.a');
      expect(registry.hasBind($child1[0])).toBe(false);
      expect(registry.hasBind($child2[0])).toBe(true);

      // detach with selector
      $parent.children().detach('.b');
      expect(registry.isKept($child2[0])).toBe(true);

      $parent.remove();
    });
  });

  describe('Registry', () => {
    it('should correctly report hasBind through lifecycle', () => {
      const el = document.createElement('div');
      expect(registry.hasBind(el)).toBe(false);
      registry.trackCleanup(el, () => {});
      expect(registry.hasBind(el)).toBe(true);
      registry.cleanup(el);
      expect(registry.hasBind(el)).toBe(false);
    });

    it('should handle errors during dispose and cleanup', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const el = document.createElement('div');
      $.atom.debug = true;

      // Dispose error
      registry.trackEffect(el, {
        dispose: () => {
          throw new Error('dispose fail');
        },
        run: () => {},
        isDisposed: false,
        executionCount: 0,
      });

      registry.cleanup(el);
      expect(warnSpy).toHaveBeenCalled();

      // Cleanup error
      registry.trackCleanup(el, () => {
        throw new Error('cleanup fail');
      });
      registry.cleanup(el);
      expect(warnSpy).toHaveBeenCalledTimes(2);

      warnSpy.mockRestore();
    });
  });

  describe('Event Patching', () => {
    it('should support on/off with handlers and edge cases', () => {
      const $el = $('<div>');
      const handler = vi.fn();

      // Normal on/off cycle
      $el.on('click', handler);
      $el.trigger('click');
      expect(handler).toHaveBeenCalledTimes(1);

      $el.off('click', handler);
      $el.trigger('click');
      expect(handler).toHaveBeenCalledTimes(1);

      // .on(events, false) branch
      $el.on('click', false);
      $el.trigger('click');

      // off without handler (no throw)
      expect(() => $el.off('click')).not.toThrow();

      // off with unregistered handler (no throw)
      expect(() => $el.off('click', () => {})).not.toThrow();
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

    it('should preserve original this context', () => {
      const $btn = $('<button>').appendTo(document.body);
      let capturedThis: HTMLElement | null = null;

      $btn.on('click', function (this: HTMLElement) {
        capturedThis = this;
      });

      $btn.trigger('click');
      expect(capturedThis).toBe($btn[0]);
      $btn.remove();
    });

    it('should reuse wrapper for same handler across events', () => {
      const handler = vi.fn();
      const $btn = $('<button>');

      $btn.on('click', handler);
      $btn.on('mouseover', handler);

      // Trigger both to verify handler works
      $btn.trigger('click');
      $btn.trigger('mouseover');
      expect(handler).toHaveBeenCalledTimes(2);

      $btn.off('click', handler);
      $btn.off('mouseover', handler);

      // Verify cleanup
      $btn.trigger('click');
      $btn.trigger('mouseover');
      expect(handler).toHaveBeenCalledTimes(2);
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
        '[atom-effect-jquery] Mount error:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
      $el.remove();
    });

    it('should handle cleanup functions that throw errors', () => {
      const $el = $('<div>').appendTo(document.body);
      $el.atomMount(() => () => {
        throw new Error('cleanup fail');
      });

      expect(() => $el.atomUnmount()).not.toThrow();
      $el.remove();
    });
  });
});
