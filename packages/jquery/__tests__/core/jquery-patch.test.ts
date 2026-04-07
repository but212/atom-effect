import { atom } from '@but212/atom-effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enablejQueryOverrides, INTERNAL_HANDLER } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';
import $ from '@/index';

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

  describe('DOM Lifecycle Overrides', () => {
    it('should manage registry lifecycle during removal (remove, empty, selectors)', () => {
      const $root = $(
        '<div id="root"><div class="target"></div><div class="stay"></div></div>'
      ).appendTo(document.body);
      const [$target, $stay] = [$root.find('.target'), $root.find('.stay')];

      registry.trackCleanup($target[0]!, () => {});
      registry.trackCleanup($stay[0]!, () => {});

      // 1. Selector-based remove (behavior test)
      $root.children().remove('.target');
      expect(registry.hasBind($target[0]!)).toBe(false);
      expect(registry.hasBind($stay[0]!)).toBe(true);

      // 2. Empty (child cleanup)
      $root.empty();
      expect(registry.hasBind($stay[0]!)).toBe(false);
    });

    it('should preserve and restore bindings during detachment', () => {
      const $el = $('<div></div>').appendTo(document.body);
      registry.trackCleanup($el[0]!, () => {});

      // Detach: should keep internal state
      $el.detach();
      expect(registry.isKept($el[0]!)).toBe(true);
      expect(registry.hasBind($el[0]!)).toBe(true);

      // Final removal: should complete cleanup
      $el.remove();
      expect(registry.hasBind($el[0]!)).toBe(false);
    });
  });

  describe('Reactive Event Integration', () => {
    it('should batch updates across all registration patterns (on, one, map)', async () => {
      const count = atom(0);
      let computeCount = 0;
      $.effect(() => {
        count.value;
        computeCount++;
        return undefined;
      });

      const $btn = $('<button>').appendTo(document.body);
      const increment = () => {
        count.value++;
        count.value++;
      };

      // Test Case 1: Standard .on()
      computeCount = 0;
      $btn.on('click', increment).trigger('click');
      await $.nextTick();
      expect(computeCount).toBe(1);

      // Test Case 2: One-time .one()
      computeCount = 0;
      $btn.one('dblclick', increment).trigger('dblclick');
      await $.nextTick();
      expect(computeCount).toBe(1);

      // Test Case 3: Event Map
      computeCount = 0;
      $btn.on({ mouseenter: increment }).trigger('mouseenter');
      await $.nextTick();
      expect(computeCount).toBe(1);

      $btn.remove();
    });

    it('should maintain compatibility for special handlers (false, symbols)', () => {
      interface JQueryInternal extends JQueryStatic {
        _data(
          element: Node,
          key: 'events'
        ): Record<string, JQuery.HandleObject<Node, unknown>[]> | undefined;
      }

      const $el = $('<div>');

      // Symbol stability check
      expect(INTERNAL_HANDLER).toBe(Symbol.for('atom-effect-internal'));

      // Special 'false' handler cleanup
      $el.on('click', false);
      $el.off('click', false);
      const events = ($ as unknown as JQueryInternal)._data($el[0]!, 'events');
      expect(events?.click).toBeUndefined();
    });
  });
});
