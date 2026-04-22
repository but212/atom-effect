import { describe, expect, it } from 'vitest';
import $ from '@/index';

describe('DOM Core Utilities', () => {
  describe('Element Iteration (atomEachElement)', () => {
    it('iterates over elements and applies bindings correctly', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      const atom = $.atom('test');

      $([div1, div2]).atomText(atom);

      expect(div1.textContent).toBe('test');
      expect(div2.textContent).toBe('test');
    });

    it('skips non-Element nodes gracefully', () => {
      const div = document.createElement('div');
      const text = document.createTextNode('text');
      const atom = $.atom('val');

      // Should not throw and only update the div
      $([div, text] as unknown as HTMLElement[]).atomText(atom);

      expect(div.textContent).toBe('val');
    });
  });

  describe('Value Unpacking ([source, options])', () => {
    it('handles [source, options] tuples in bindings', async () => {
      const el = document.createElement('div');
      const atom = $.atom(10);

      $(el).atomBind({
        text: [atom, (v: number) => `Count: ${v}`],
      });
      await $.nextTick();
      expect(el.textContent).toBe('Count: 10');
    });

    it('handles plain objects and static values', () => {
      const el = document.createElement('div');
      $(el).atomBind({
        css: { color: 'red' },
      });
      expect(el.style.color).toBe('red');
    });
  });
});
