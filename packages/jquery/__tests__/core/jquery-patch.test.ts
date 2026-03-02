import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/index';
import { atom } from '@but212/atom-effect';
import { enablejQueryOverrides } from '../../src/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '../../src/core/registry';

describe('jQuery Patch (Lifecycle & Events)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enablejQueryOverrides();
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
  });

  describe('DOM Removal Overrides', () => {
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
});
