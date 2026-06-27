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
      const atom = $.atom('value');

      // Should not throw and only update the div
      $([div, text] as HTMLElement[]).atomText(atom);

      expect(div.textContent).toBe('value');
    });
  });

  describe('Value Unpacking ([source, options])', () => {
    it('handles [source, options] tuples in bindings', async () => {
      const element = document.createElement('div');
      const atom = $.atom(10);

      $(element).atomBind({
        text: [atom, (value: number) => `Count: ${value}`],
      });
      await $.nextTick();
      expect(element.textContent).toBe('Count: 10');
    });

    it('handles plain objects and static values', () => {
      const element = document.createElement('div');
      $(element).atomBind({
        css: { color: 'red' },
      });
      expect(element.style.color).toBe('red');
    });
  });
});
