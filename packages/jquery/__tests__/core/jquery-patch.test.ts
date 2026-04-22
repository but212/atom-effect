import { beforeEach, describe, expect, it } from 'vitest';
import $ from '@/index';

describe('jQuery Patch (Lifecycle & Events)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('DOM Lifecycle Overrides', () => {
    it('should correctly manage lifecycle during removal and detachment', async () => {
      const $root = $('<div id="root"><span class="target"></span></div>').appendTo(document.body);
      const $target = $root.find('.target');
      const atom = $.atom('initial');
      $target.atomText(atom);

      // 1. Detach: binding state preserved
      $target.detach();
      atom.value = 'detached';
      await $.nextTick();
      expect($target.text()).toBe('detached');

      // 2. Re-append and Remove: binding state cleaned up
      $target.appendTo($root).remove();
      atom.value = 'removed';
      await $.nextTick();
      expect($target.text()).not.toBe('removed');
    });
  });

  describe('Reactive Event Integration', () => {
    it('should apply reactive batching across all registration signatures', async () => {
      const count = $.atom(0);
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

    it('should ensure handler identification and unbinding works correctly', () => {
      const $el = $('<div>').appendTo('body');
      let count = 0;
      const handler = () => {
        count++;
      };

      // 1. Verify unbinding with ORIGINAL handler works
      $el.on('click', handler);
      $el.trigger('click');
      expect(count).toBe(1);

      $el.off('click', handler);
      $el.trigger('click');
      expect(count).toBe(1); // Should not increase

      // 2. Special handler (boolean false) compatibility
      let submitCount = 0;
      const form = $('<form>')
        .on('submit', () => {
          submitCount++;
          return false;
        })
        .appendTo('body');

      form.trigger('submit');
      expect(submitCount).toBe(1);

      form.off('submit');
      // Do not trigger submit again as it will cause a real navigation in the browser.

      form.remove();
      $el.remove();
    });
  });
});
