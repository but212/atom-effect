import { describe, expect, it } from 'vitest';
import { isPromise } from '@/index';

const thenMethod = {
  then(resolve: () => void) {
    resolve();
  },
};

class CustomThenable {
  then(resolve: () => void) {
    resolve();
  }
}

describe('Type Guards', () => {
  describe('isPromise', () => {
    it.each<[string, unknown]>([
      ['native Promise.resolve', Promise.resolve(42)],
      ['native new Promise', new Promise((resolve) => resolve(42))],
      ['native caught rejection', Promise.reject(new Error('fail')).catch(() => {})],
      ['object with a then method', { ...thenMethod }],
      ['function with a then method', Object.assign(() => {}, thenMethod)],
      ['custom class with a then method', new CustomThenable()],
      ['array with a then method', Object.assign([], thenMethod)],
    ])('returns true for %s', (_label, value) => {
      expect(isPromise(value)).toBe(true);
    });

    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['zero', 0],
      ['integer', 42],
      ['negative number', -1],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['empty string', ''],
      ['string', 'promise'],
      ['true', true],
      ['false', false],
      ['symbol', Symbol('test')],
      ['bigint', 10n],
      ['empty object', {}],
      ['plain object', { a: 1 }],
      ['object with numeric then', { then: 42 }],
      ['object with string then', { then: 'string' }],
      ['object with object then', { then: {} }],
      ['object with null then', { then: null }],
      ['object with undefined then', { then: undefined }],
      ['object with boolean then', { then: true }],
      ['empty array', []],
      ['array without then', [1, 2, 3]],
      ['array with non-function then', Object.assign([], { then: 42 })],
      ['plain function', () => {}],
      ['function with non-function then', Object.assign(() => {}, { then: 42 })],
      ['Date', new Date()],
      ['RegExp', /regex/],
      ['Map', new Map()],
      ['Set', new Set()],
      ['Error', new Error('error')],
    ])('returns false for %s', (_label, value) => {
      expect(isPromise(value)).toBe(false);
    });
  });
});
