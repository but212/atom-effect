import { describe, expect, it } from 'vitest';
import $ from '@/index'; // Register plugins ($.atom)
import { getLIS, getSelector, isReactive, shallowEqual } from '@/utils';
import { sanitizeHtml } from '@/utils/sanitize';

describe('Utils', () => {
  describe('getSelector', () => {
    it('should generate correct selectors', () => {
      const cases = [
        { id: 'test-id', class: '', tag: 'div', expected: 'div#test-id' },
        { id: '', class: 'foo bar', tag: 'div', expected: 'div.foo.bar' },
        { id: '', class: '', tag: 'span', expected: 'span' },
        { id: '', class: '   ', tag: 'div', expected: 'div' },
      ];

      cases.forEach(({ id, class: cls, tag, expected }) => {
        const el = document.createElement(tag);
        if (id) el.id = id;
        if (cls) el.className = cls;
        expect(getSelector(el)).toBe(expected);
      });
    });

    it('should return tagName for element without id or classes', () => {
      const el = document.createElement('div');
      expect(getSelector(el)).toBe('div');
    });
  });

  describe('Reactivity', () => {
    it('isReactive identifies atoms', () => {
      expect(isReactive($.atom(1))).toBe(true);
      expect(isReactive(1)).toBe(false);
      expect(isReactive(null)).toBe(false);
      expect(isReactive({ value: 1, subscribe: () => {} })).toBe(false);
    });
  });

  describe('shallowEqual', () => {
    it('compares objects correctly', () => {
      const obj = { a: 1 };
      const cases = [
        [obj, obj, true],
        [{ a: 1, b: 2 }, { a: 1, b: 2 }, true],
        [{ a: 1 }, { a: 2 }, false],
        [{ a: 1 }, { b: 1 }, false],
        [{ a: 1 }, { a: 1, b: 2 }, false],
        [null, {}, false],
        [1, 1, true],
        [1, '1', false],
      ] as const;

      cases.forEach(([a, b, expected]) => {
        expect(shallowEqual(a, b)).toBe(expected);
      });
    });
  });

  describe('sanitizeHtml', () => {
    it('should preserve HTML comment separators', () => {
      const input = '<div>A</div><!--sep--><span>B</span>';
      const output = sanitizeHtml(input);
      expect(output).toContain('<!--sep-->');
      expect(output).toContain('A');
      expect(output).toContain('B');
    });

    it('should preserve multiple consecutive comment separators', () => {
      const parts = ['<p>1</p>', '<p>2</p>', '<p>3</p>'];
      const combined = parts.join('<!--sep-->');
      const sanitized = sanitizeHtml(combined);
      const fragments = sanitized.split('<!--sep-->');
      expect(fragments).toHaveLength(3);
    });

    it('should sanitize dangerous tags while preserving separators', () => {
      const input =
        '<div>Safe</div><!--sep--><script>alert("xss")</script><!--sep--><span>OK</span>';
      const sanitized = sanitizeHtml(input);
      const fragments = sanitized.split('<!--sep-->');
      expect(fragments).toHaveLength(3);
      expect(fragments[0]).toContain('Safe');
      expect(fragments[1]).not.toContain('script');
      expect(fragments[2]).toContain('OK');
    });
  });

  describe('getLIS', () => {
    it('calculates longest increasing subsequence', () => {
      const cases = [
        { arr: [10, 9, 2, 5, 3, 7, 101, 18], expected: [2, 4, 5, 7] }, // indices for 2, 3, 7, 18
        { arr: [], expected: [] },
        { arr: [5], expected: [0] },
        { arr: [1, 2, 3], expected: [0, 1, 2] },
        { arr: [3, 2, 1], expected: [2] },
      ];

      cases.forEach(({ arr, expected }) => {
        expect(Array.from(getLIS(arr))).toEqual(expected);
      });
    });
  });
});
