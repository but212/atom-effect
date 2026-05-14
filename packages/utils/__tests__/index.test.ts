import { describe, expect, it } from 'vitest';
import { shallowEqual } from '../src/index';

describe('shallowEqual', () => {
  it('should return true for identical values', () => {
    expect(shallowEqual(1, 1)).toBe(true);
    const obj = { a: 1 };
    expect(shallowEqual(obj, obj)).toBe(true);
  });

  it('should return false for different primitives', () => {
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual('a', 'b')).toBe(false);
    expect(shallowEqual(true, false)).toBe(false);
  });

  it('should handle null and undefined', () => {
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(undefined, undefined)).toBe(true);
    expect(shallowEqual(null, undefined)).toBe(false);
    expect(shallowEqual({}, null)).toBe(false);
  });

  it('should return true for equal objects', () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(shallowEqual({}, {})).toBe(true);
  });

  it('should return false for objects with different keys', () => {
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('should return false for objects with different values', () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('should handle NaN correctly using Object.is', () => {
    expect(shallowEqual({ a: NaN }, { a: NaN })).toBe(true);
  });

  it('should handle signed zeros correctly using Object.is', () => {
    expect(shallowEqual({ a: 0 }, { a: -0 })).toBe(false);
  });

  it('should return false if one is an object and the other is not', () => {
    expect(shallowEqual({ a: 1 }, 1)).toBe(false);
    expect(shallowEqual(1, { a: 1 })).toBe(false);
  });
});
