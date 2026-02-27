import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../src/constants';

describe('Constants', () => {
  describe('ERROR_MESSAGES', () => {
    it('should interpolate dynamic arguments into the message', () => {
      const cases: [string, string][] = [
        [ERROR_MESSAGES.ROUTE.NOT_FOUND('home'), 'home'],
        [ERROR_MESSAGES.ROUTE.TEMPLATE_NOT_FOUND('#tpl'), '#tpl'],
        [ERROR_MESSAGES.ROUTE.TARGET_NOT_FOUND('#app'), '#app'],
        [ERROR_MESSAGES.ROUTE.MALFORMED_URI('%'), '%'],
        [ERROR_MESSAGES.SECURITY.BLOCKED_CSS_VALUE('color'), 'color'],
        [ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER('onclick'), 'onclick'],
        [ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL('href'), 'href'],
        [ERROR_MESSAGES.SECURITY.BLOCKED_PROP('innerHTML'), 'innerHTML'],
        [ERROR_MESSAGES.BINDING.INVALID_INPUT_ELEMENT('div'), 'div'],
        [ERROR_MESSAGES.LIST.DUPLICATE_KEY('id-1', 5, '#list'), 'id-1'],
        [ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomAttr'), 'atomAttr'],
        [ERROR_MESSAGES.BINDING.MISSING_CONDITION('atomClass'), 'atomClass'],
      ];

      cases.forEach(([result, expected]) => {
        expect(result).toContain(expected);
      });
    });

    it('should return a non-empty string for zero-argument messages', () => {
      expect(ERROR_MESSAGES.SECURITY.UNSAFE_CONTENT()).toBeTruthy();
      expect(ERROR_MESSAGES.BINDING.PARSE_ERROR('err')).toBeTruthy();
      expect(ERROR_MESSAGES.MOUNT.ERROR('comp')).toBeTruthy();
      expect(ERROR_MESSAGES.MOUNT.CLEANUP_ERROR('#sel')).toBeTruthy();
      expect(ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR('#sel')).toBeTruthy();
      expect(ERROR_MESSAGES.BINDING.CLEANUP_ERROR('#sel')).toBeTruthy();
    });
  });
});
