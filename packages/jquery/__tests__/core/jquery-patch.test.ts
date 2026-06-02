import { beforeEach, describe, expect, it } from 'vitest';
import { disablejQueryOverrides, enablejQueryOverrides } from '@/core/jquery-patch';
import { disableAutoCleanup } from '@/core/registry';
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

    it('should support remove and detach with custom jQuery selector arguments', async () => {
      const $root = $(
        '<div id="root"><span class="target filter-me"></span><span class="target keep-me"></span></div>'
      ).appendTo(document.body);
      const $targets = $root.find('.target');
      const atom1 = $.atom('v1');
      const atom2 = $.atom('v2');

      $targets.eq(0).atomText(atom1);
      $targets.eq(1).atomText(atom2);
      await $.nextTick();

      // 1. detach with selector filter
      $targets.detach('.filter-me');
      atom1.value = 'detached1';
      atom2.value = 'updated2';
      await $.nextTick();

      // target 0 is kept, target 1 is not detached so it's updated normally
      expect($targets.eq(0).text()).toBe('detached1');
      expect($targets.eq(1).text()).toBe('updated2');

      // 2. remove with selector filter
      $targets.eq(0).appendTo($root);
      $targets.remove('.filter-me');
      atom1.value = 'removed1';
      await $.nextTick();
      expect($targets.eq(0).text()).not.toBe('removed1');

      $root.remove();
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

      // Verify unbinding with event map containing ORIGINAL handler works
      let mapCount = 0;
      const mapHandler = () => {
        mapCount++;
      };
      $el.on({ click: mapHandler });
      $el.trigger('click');
      expect(mapCount).toBe(1);

      $el.off({ click: mapHandler });
      $el.trigger('click');
      expect(mapCount).toBe(1); // Should not increase

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

  describe('Configuration Overrides & Edge Cases', () => {
    it('should exit early on double initialization of jQuery overrides (idempotence)', () => {
      // Calling enablejQueryOverrides() when already active should be a no-op
      enablejQueryOverrides();
    });

    it('should handle lifecycle = false options gracefully without override', async () => {
      // Re-initialize AEJ with patch lifecycle disabled and autoCleanup disabled
      disablejQueryOverrides();
      disableAutoCleanup();

      $.initAEJ({
        patch: { lifecycle: false },
        autoCleanup: false,
      });

      const $root = $('<div id="root"><span class="target"></span></div>').appendTo(document.body);
      const $target = $root.find('.target');
      const atom = $.atom('initial');
      $target.atomText(atom);
      await $.nextTick();

      // Because lifecycle overrides are disabled, removing the element should NOT clean up registry bindings
      $target.remove();
      atom.value = 'updated-post-remove';
      await $.nextTick();

      // Binding registry should still sync because cleanup did not occur on remove
      expect($target.text()).toBe('updated-post-remove');

      // Restore state
      disablejQueryOverrides();
      $.initAEJ({ patch: true, autoCleanup: true });
    });

    it('should handle null/undefined nodes in target collections during remove/detach without throwing', () => {
      const $el = $('<span>').appendTo(document.body);
      const $mixed = $el.add(null as unknown as Element);

      expect(() => $mixed.remove()).not.toThrow();

      const $el2 = $('<span>').appendTo(document.body);
      const $mixed2 = $el2.add(undefined as unknown as Element);
      expect(() => $mixed2.detach()).not.toThrow();

      $el.remove();
      $el2.remove();
    });
  });
});
