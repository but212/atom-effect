import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../src/constants';

describe('Constants', () => {
  describe('ERROR_MESSAGES', () => {
    it('should generate error messages with dynamic content', () => {
      // iterate over keys that are functions to ensure they interpolate correctly
      const dynamicErrors = [
        { fn: ERROR_MESSAGES.ROUTE_NOT_FOUND, args: ['home'], expected: 'home' },
        { fn: ERROR_MESSAGES.TEMPLATE_NOT_FOUND, args: ['#tpl'], expected: '#tpl' },
        { fn: ERROR_MESSAGES.TARGET_NOT_FOUND, args: ['#app'], expected: '#app' },
        { fn: ERROR_MESSAGES.MALFORMED_URI, args: ['%'], expected: '%' },
        { fn: ERROR_MESSAGES.BLOCKED_DANGEROUS_VALUE, args: ['innerHTML'], expected: 'innerHTML' },
        { fn: ERROR_MESSAGES.BLOCKED_EVENT_HANDLER, args: ['onclick'], expected: 'onclick' },
        { fn: ERROR_MESSAGES.BLOCKED_PROTOCOL, args: ['href'], expected: 'href' },
        { fn: ERROR_MESSAGES.BLOCKED_DANGEROUS_PROP, args: ['innerHTML'], expected: 'innerHTML' },
        { fn: ERROR_MESSAGES.INVALID_INPUT_ELEMENT, args: ['div'], expected: 'div' },
        { fn: ERROR_MESSAGES.DUPLICATE_KEY, args: ['id-1', 5], expected: 'id-1' },
      ];

      dynamicErrors.forEach(({ fn, args, expected }) => {
        // @ts-expect-error
        const result = fn(...args);
        expect(result).toContain(expected);
      });
    });

    it('should have required static error messages', () => {
      expect(ERROR_MESSAGES.UNSAFE_CONTENT).toBeTruthy();
    });
  });
});
