import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import { getSelector, getValue, isReactive } from '../src/utils';

describe('Utils', () => {
  describe('getSelector', () => {
    it('should return ID if present', () => {
      const el = document.createElement('div');
      el.id = 'test-id';
      expect(getSelector(el)).toBe('#test-id');
    });

    it('should return tag and classes if present', () => {
      const el = document.createElement('div');
      el.className = 'foo bar';
      expect(getSelector(el)).toBe('div.foo.bar');
    });

    it('should return tag if no ID or class', () => {
      const el = document.createElement('span');
      expect(getSelector(el)).toBe('span');
    });

    it('should return unknown for null/empty jquery', () => {
      expect(getSelector($())).toBe('unknown');
      expect(getSelector(null as unknown as Element)).toBe('unknown');
    });
  });

  describe('isReactive', () => {
    it('should identify atoms as reactive', () => {
      const a = { value: 1, subscribe: () => {} };
      expect(isReactive(a as unknown as object)).toBe(true);
      expect(isReactive(1)).toBe(false);
      expect(isReactive(null)).toBe(false);
    });
  });

  describe('getValue', () => {
    it('should extract value from reactive objects', () => {
      const a = { value: 10, subscribe: () => {} };
      expect(getValue(a as unknown as object)).toBe(10);
      expect(getValue(5)).toBe(5);
      expect(getValue('str')).toBe('str');
      expect(getValue(null as any)).toBe(null);
    });
  });

  describe('getSelector edge cases', () => {
    it('should handle elements with only whitespace classes', () => {
      const div = document.createElement('div');
      div.className = '   ';
      expect(getSelector(div)).toBe('div');
    });
  });
});
