import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../src/constants';

describe('Constants', () => {
  describe('ERROR_MESSAGES', () => {
    it('should interpolate dynamic arguments into the message', () => {
      const cases: [string, string][] = [
        [ERROR_MESSAGES.ROUTE_NOT_FOUND('home'), 'home'],
        [ERROR_MESSAGES.TEMPLATE_NOT_FOUND('#tpl'), '#tpl'],
        [ERROR_MESSAGES.TARGET_NOT_FOUND('#app'), '#app'],
        [ERROR_MESSAGES.MALFORMED_URI('%'), '%'],
        [ERROR_MESSAGES.BLOCKED_DANGEROUS_CSS_VALUE('color'), 'color'],
        [ERROR_MESSAGES.BLOCKED_EVENT_HANDLER('onclick'), 'onclick'],
        [ERROR_MESSAGES.BLOCKED_PROTOCOL('href'), 'href'],
        [ERROR_MESSAGES.BLOCKED_DANGEROUS_PROP('innerHTML'), 'innerHTML'],
        [ERROR_MESSAGES.INVALID_INPUT_ELEMENT('div'), 'div'],
        [ERROR_MESSAGES.DUPLICATE_KEY('id-1', 5), 'id-1'],
        [ERROR_MESSAGES.MISSING_SOURCE('atomAttr'), 'atomAttr'],
        [ERROR_MESSAGES.MISSING_CONDITION('atomClass'), 'atomClass'],
      ];

      cases.forEach(([result, expected]) => {
        expect(result).toContain(expected);
      });
    });

    it('should return a non-empty string for zero-argument messages', () => {
      expect(ERROR_MESSAGES.UNSAFE_CONTENT()).toBeTruthy();
      expect(ERROR_MESSAGES.PARSE_ERROR()).toBeTruthy();
      expect(ERROR_MESSAGES.MOUNT_ERROR()).toBeTruthy();
      expect(ERROR_MESSAGES.MOUNT_CLEANUP_ERROR()).toBeTruthy();
      expect(ERROR_MESSAGES.EFFECT_DISPOSE_ERROR()).toBeTruthy();
      expect(ERROR_MESSAGES.BINDING_CLEANUP_ERROR()).toBeTruthy();
    });
  });
});
