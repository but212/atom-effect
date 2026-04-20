import { describe, expect, it, vi } from 'vitest';
import { atomEachElement, unpack } from '@/core/dom';
import $ from '@/index';

vi.mock('@/core/registry', () => ({
  registry: {
    trackCleanup: vi.fn(),
  },
  enableAutoCleanup: vi.fn(),
  disableAutoCleanup: vi.fn(),
}));

vi.mock('@/core/jquery-patch', () => ({
  enablejQueryOverrides: vi.fn(),
  disablejQueryOverrides: vi.fn(),
  INTERNAL_HANDLER: Symbol.for('atom-effect-internal'),
  WRAPPED_HANDLER: Symbol.for('atom-effect-wrapped'),
}));

vi.mock('@/utils/debug', () => ({
  debug: {
    warn: vi.fn(),
    domUpdated: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DOM Core Utilities', () => {
  describe('atomEachElement', () => {
    it('iterates over elements and applies the function', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      const jq = $([div1, div2]);
      const fn = vi.fn();

      atomEachElement(jq, fn);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, div1);
      expect(fn).toHaveBeenNthCalledWith(2, div2);
    });

    it('skips non-Element nodes', () => {
      const div = document.createElement('div');
      const text = document.createTextNode('text');
      const jq = $([div, text]);
      const fn = vi.fn();

      atomEachElement(jq as unknown as JQuery, fn);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(div);
    });
  });

  describe('unpack', () => {
    it('returns [val] for non-array values', () => {
      expect(unpack(123)).toEqual([123]);
      expect(unpack('foo')).toEqual(['foo']);
      expect(unpack({ a: 1 })).toEqual([{ a: 1 }]);
    });

    it('returns [val] for arrays that are not [source, options] tuples', () => {
      expect(unpack([1, 2, 3])).toEqual([[1, 2, 3]]);
    });

    it('unpacks [source, options] for static values', () => {
      const options = { opt: 1 };
      expect(unpack(['static', options])).toEqual(['static', options]);
      expect(unpack([123, options])).toEqual([123, options]);
    });

    it('unpacks [source, options] for plain objects', () => {
      const source = { data: 'test' };
      const options = { opt: 1 };
      expect(unpack([source, options])).toEqual([source, options]);
    });

    it('unpacks [source, options] when source is a function', () => {
      const fn = () => {};
      const options = { opt: 1 };
      expect(unpack([fn, options])).toEqual([fn, options]);
    });

    it('unpacks [source, options] when source is an atom (has value)', () => {
      const atom = { value: 1 };
      const options = { opt: 1 };
      expect(unpack([atom, options] as [unknown, unknown])).toEqual([atom, options]);
    });

    it('unpacks [source, options] when source is a promise (has then)', () => {
      const promise = Promise.resolve(1);
      const options = { opt: 1 };
      expect(unpack([promise, options] as [unknown, unknown])).toEqual([promise, options]);
    });
  });
});
