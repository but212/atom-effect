import { describe, expect, it } from 'vitest';
import { getSelector } from '@/utils';
import { sanitizeHtml } from '@/utils/sanitize';

describe('Utils', () => {
  describe('getSelector', () => {
    it('should generate correct selectors including SVG support', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'foo bar');

      const cases = [
        {
          element: Object.assign(document.createElement('div'), { id: 'test-id' }),
          expected: 'div#test-id',
        },
        {
          element: Object.assign(document.createElement('div'), { className: 'foo bar' }),
          expected: 'div.foo.bar',
        },
        { element: document.createElement('span'), expected: 'span' },
        {
          element: Object.assign(document.createElement('div'), { className: '   ' }),
          expected: 'div',
        },
        { element: svg, expected: 'svg.foo.bar' },
      ];

      for (const { element, expected } of cases) {
        expect(getSelector(element)).toBe(expected);
      }
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
      const xssPayload =
        '<div>Safe</div><!--sep--><script>alert(1)</script><!--sep--><span>OK</span>';
      const sanitized = sanitizeHtml(xssPayload);
      const fragments = sanitized.split('<!--sep-->');

      expect(fragments).toHaveLength(3);
      expect(fragments[1]).not.toContain('script');
      expect(fragments[2]).toContain('OK');
    });
  });
});
