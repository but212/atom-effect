import { describe, expect, it } from 'vitest';
import $ from '@/index';
import { getSelector, isPromise } from '@/utils';
import { sanitizeHtml } from '@/utils/sanitize';

describe('Utils', () => {
  describe('getSelector', () => {
    it('should generate correct selectors including SVG support', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'foo bar');

      const cases = [
        {
          el: Object.assign(document.createElement('div'), { id: 'test-id' }),
          expected: 'div#test-id',
        },
        {
          el: Object.assign(document.createElement('div'), { className: 'foo bar' }),
          expected: 'div.foo.bar',
        },
        { el: document.createElement('span'), expected: 'span' },
        {
          el: Object.assign(document.createElement('div'), { className: '   ' }),
          expected: 'div',
        },
        { el: svg, expected: 'svg.foo.bar' },
      ];

      for (const { el, expected } of cases) {
        expect(getSelector(el)).toBe(expected);
      }
    });
  });

  describe('Reactivity & Promises', () => {
    it('isAtom identifies atoms', () => {
      expect($.isAtom($.atom(1))).toBe(true);
      expect($.isAtom(1)).toBe(false);
      expect($.isAtom(null)).toBe(false);
      expect($.isAtom({ value: 1, subscribe: () => {} })).toBe(false);
    });

    it('isPromise identifies thenables including functions', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise({ then: () => {} })).toBe(true);

      const thenableFn = () => {};
      thenableFn.then = () => {};
      expect(isPromise(thenableFn)).toBe(true);
    });
  });

  describe('sanitizeHtml', () => {
    it('should preserve comment separators and filter dangerous tags', () => {
      // Basic preservation
      expect(sanitizeHtml('<div>A</div><!--sep--><span>B</span>')).toContain('<!--sep-->');

      // Multiple separators
      const combined = ['<p>1</p>', '<p>2</p>', '<p>3</p>'].join('<!--sep-->');
      expect(sanitizeHtml(combined).split('<!--sep-->')).toHaveLength(3);

      // Security + preservation
      const xss = '<div>Safe</div><!--sep--><script>alert(1)</script><!--sep--><span>OK</span>';
      const sanitized = sanitizeHtml(xss);
      const fragments = sanitized.split('<!--sep-->');

      expect(fragments).toHaveLength(3);
      expect(fragments[1]).not.toContain('script');
      expect(fragments[2]).toContain('OK');
    });
  });
});
