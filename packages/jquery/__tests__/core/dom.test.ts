import { describe, expect, it, vi } from 'vitest';
import { LOG_PREFIXES } from '@/constants';
import { atomEachElement, createContext, unpack } from '@/core/dom';
import { registry } from '@/core/registry';
import $ from '@/index';
import type { BindingContext } from '@/types';
import { debug } from '@/utils/debug';

vi.mock('@/core/registry', () => ({
  registry: {
    trackCleanup: vi.fn(),
  },
  enableAutoCleanup: vi.fn(),
  disableAutoCleanup: vi.fn(),
}));

vi.mock('@/core/jquery-patch', () => ({
  enablejQueryOverrides: vi.fn(),
}));

vi.mock('@/utils/debug', () => ({
  debug: {
    log: vi.fn(),
  },
}));

describe('DOM Core Utilities', () => {
  describe('createContext', () => {
    it('creates a context with el and trackCleanup', () => {
      const el = document.createElement('div');
      const ctx = createContext(el);

      expect(ctx.el).toBe(el);
      expect(typeof ctx.trackCleanup).toBe('function');

      const cleanup = () => {};
      ctx.trackCleanup(cleanup);
      expect(registry.trackCleanup).toHaveBeenCalledWith(el, cleanup);
    });
  });

  describe('atomEachElement', () => {
    it('iterates over elements and applies the function', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      const jq = $([div1, div2]);
      const fn = vi.fn();

      atomEachElement(jq, fn);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, null, div1);
      expect(fn).toHaveBeenNthCalledWith(2, null, div2);
    });

    it('creates context if needsCtx is true', () => {
      const div = document.createElement('div');
      const jq = $([div]);
      const fn = vi.fn();

      atomEachElement(jq, fn, { needsCtx: true });

      expect(fn).toHaveBeenCalledTimes(1);
      const [ctx, el] = fn.mock.calls[0] as unknown as [BindingContext, HTMLElement];
      expect(el).toBe(div);
      expect(ctx.el).toBe(div);
      expect(typeof ctx.trackCleanup).toBe('function');
    });

    it('skips non-Element nodes and logs a debug message', () => {
      const div = document.createElement('div');
      const text = document.createTextNode('text');
      const jq = $([div, text]);
      const fn = vi.fn();

      atomEachElement(jq as unknown as JQuery, fn);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(null, div);
      expect(debug.log).toHaveBeenCalledWith(
        LOG_PREFIXES.BINDING,
        expect.stringContaining('Skipping non-Element node')
      );
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

    it('returns [val] if the second element is an array (not a tuple)', () => {
      const arrayVal: [string, string[]] = ['a', ['b', 'c']];
      expect(unpack(arrayVal)).toEqual([arrayVal]);
    });

    it('unpacks [source, options] for static values (BUG REPRODUCTION)', () => {
      const options = { opt: 1 };
      expect(unpack(['static', options])).toEqual(['static', options]);
      expect(unpack([123, options])).toEqual([123, options]);
    });

    it('unpacks [source, options] for plain objects (BUG REPRODUCTION)', () => {
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

    it('returns [val] if the source is null or not an object/function (BUG REPRODUCTION)', () => {
      // These currently fail to unpack as [source, options]
      expect(unpack([null, {}] as [unknown, unknown])).toEqual([null, {}]);
      expect(unpack([undefined, {}] as [unknown, unknown])).toEqual([undefined, {}]);
    });
  });
});
