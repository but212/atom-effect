import { describe, expect, it } from 'vitest';
import $ from '../src/index'; // Register plugins ($.atom)
import {
  getLIS,
  getSelector,
  getValue,
  isDangerousCssValue,
  isDangerousUrl,
  isReactive,
  sanitizeHtml,
  shallowEqual,
} from '../src/utils';

describe('Utils', () => {
  describe('getSelector', () => {
    it('should generate correct selectors', () => {
      const cases = [
        { id: 'test-id', class: '', tag: 'div', expected: '#test-id' },
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

    it('should unknown for invalid inputs', () => {
      expect(getSelector($())).toBe('unknown');
      expect(getSelector(null as unknown as Element)).toBe('unknown');
    });
  });

  describe('Reactivity', () => {
    it('isReactive identifies atoms', () => {
      expect(isReactive($.atom(1))).toBe(true);
      expect(isReactive(1)).toBe(false);
      expect(isReactive(null)).toBe(false);
      expect(isReactive({ value: 1, subscribe: () => {} })).toBe(false);
    });

    it('getValue extracts value', () => {
      expect(getValue($.atom(10))).toBe(10);
      expect(getValue(5)).toBe(5);
      expect(getValue('str')).toBe('str');
      expect(getValue(null as unknown)).toBe(null);
    });
  });

  describe('Security', () => {
    describe('sanitizeHtml', () => {
      it('neutralizes dangerous content', () => {
        const dangerous = [
          {
            input: '<div><script>alert(1)</script>content</div>',
            check: (s: string) => s === '<div>content</div>',
          },
          {
            input: '<div onclick="alert(1)">click me</div>',
            check: (s: string) => !s.includes('onclick') && s.includes('data-unsafe-attr'),
          },
          {
            input: '<a href="javascript:alert(1)">link</a>',
            check: (s: string) => !s.includes('javascript:') && s.includes('data-unsafe-protocol'),
          },
        ];
        dangerous.forEach(({ input, check }) => {
          expect(check(sanitizeHtml(input))).toBe(true);
        });
      });

      it('preserves safe content', () => {
        const input = '<div class="safe"><b>Bold</b></div>';
        expect(sanitizeHtml(input)).toBe(input);
        expect(sanitizeHtml(null as unknown as string)).toBe('');
      });
    });

    describe('isDangerousUrl', () => {
      it('identifies dangerous protocols correctly', () => {
        const cases = [
          ['href', 'javascript:alert(1)', true],
          ['src', 'vbscript:msgbox', true],
          ['href', '  javascript  :  alert(1)  ', true],
          ['href', 'https://google.com', false],
          ['src', '/path/to/image.png', false],
          ['href', 'mailto:user@example.com', false],
          ['title', 'javascript:not-executed', false], // allowed in non-url attr
          ['data-val', 'javascript:safe', false],
        ] as const;
        cases.forEach(([attr, val, expected]) => {
          expect(isDangerousUrl(attr, val)).toBe(expected);
        });
      });
    });

    describe('isDangerousCssValue', () => {
      it('identifies dangerous css values', () => {
        const cases = [
          ['url(javascript:alert(1))', true],
          ['url("javascript:alert(1)")', true],
          ["url('vbscript:msgbox')", true],
          ['url(image.png)', false],
          ['url("https://example.com/bg.jpg")', false],
          ['red', false],
        ] as const;
        cases.forEach(([val, expected]) => {
          expect(isDangerousCssValue(val)).toBe(expected);
        });
      });
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
