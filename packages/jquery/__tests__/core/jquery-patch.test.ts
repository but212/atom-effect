import { atom } from '@but212/atom-effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enablejQueryOverrides, INTERNAL_HANDLER, WRAPPED_HANDLER } from '@/core/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';
import $ from '@/index';

/** Type definitions for accessing jQuery's internal event store and metadata */
interface JQueryInternal extends JQueryStatic {
  _data(
    element: Node,
    key: 'events'
  ): Record<string, JQuery.HandleObject<Node, unknown>[]> | undefined;
}

interface HandlerMetadata extends Function {
  [INTERNAL_HANDLER]?: boolean;
  [WRAPPED_HANDLER]?: JQuery.EventHandlerBase<unknown, JQuery.TriggeredEvent>;
}

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
    it('should correctly manage registry lifecycle during removal and detachment', () => {
      const $root = $('<div id="root"><span class="target"></span></div>').appendTo(document.body);
      const $target = $root.find('.target');
      registry.trackCleanup($target[0]!, () => {});

      // 1. Detach: binding state preserved
      $target.detach();
      expect(registry.isKept($target[0]!)).toBe(true);
      expect(registry.hasBind($target[0]!)).toBe(true);

      // 2. Re-append and Remove: binding state cleaned up
      $target.appendTo($root).remove();
      expect(registry.hasBind($target[0]!)).toBe(false);
    });
  });

  describe('Reactive Event Integration', () => {
    it('should apply reactive batching across all registration signatures', async () => {
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

      // Batching verification patterns
      const patterns: Array<{ name: string; setup: () => void }> = [
        { name: 'Standard .on()', setup: () => $btn.on('click', increment).trigger('click') },
        {
          name: 'One-time .one()',
          setup: () => $btn.one('dblclick', increment).trigger('dblclick'),
        },
        {
          name: 'Event Map',
          setup: () => $btn.on({ mouseenter: increment }).trigger('mouseenter'),
        },
        {
          name: 'Robust positioning (handler not last)',
          setup: () => {
            const $span = $('<span>').appendTo($btn);
            ($btn.on as (t: string, s: string, d: unknown, h: unknown, e: string) => JQuery)(
              'keydown',
              'span',
              { d: 1 },
              increment,
              'extra'
            );
            $span.trigger('keydown');
          },
        },
      ];

      for (const { name, setup } of patterns) {
        computeCount = 0;
        setup();
        await $.nextTick();
        expect(computeCount, `Batching failed for: ${name}`).toBe(1);
      }
      $btn.remove();
    });

    it('should ensure handler identification and cross-bundle compatibility', () => {
      const $el = $('<div>');
      const handler = () => {};

      // 1. Property-based marking for cross-instance unbinding
      $el.on('click', handler);
      expect(
        (handler as HandlerMetadata)[WRAPPED_HANDLER],
        'Missing wrapped pointer'
      ).toBeDefined();

      const events = ($ as unknown as JQueryInternal)._data($el[0]!, 'events');
      const registered = events?.click?.[0]?.handler as HandlerMetadata;
      expect(registered[INTERNAL_HANDLER], 'Handler not marked as internal').toBe(true);

      // 2. Special handler (boolean false) compatibility
      $el.on('submit', false);
      $el.off('submit', false);
      const postEvents = ($ as unknown as JQueryInternal)._data($el[0]!, 'events');
      expect(postEvents?.submit).toBeUndefined();
    });
  });
});
