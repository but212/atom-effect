import { describe, expect, it } from 'vitest';
import {
  SYSTEM_BINDING,
  SYSTEM_CORE,
  SYSTEM_LIST,
  SYSTEM_MOUNT,
  SYSTEM_ROUTE,
  SYSTEM_SECURITY,
} from '@/constants';

describe('Constants', () => {
  describe('ERROR_MESSAGES', () => {
    it('should interpolate dynamic arguments into the message', () => {
      const cases: [string, string][] = [
        [SYSTEM_ROUTE.ERRORS.NOT_FOUND('home'), 'home'],
        [SYSTEM_SECURITY.ERRORS.BLOCKED_EVENT_HANDLER('onclick'), 'onclick'],
        [SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL('href'), 'href'],
        [SYSTEM_SECURITY.ERRORS.BLOCKED_PROP('innerHTML'), 'innerHTML'],
        [SYSTEM_BINDING.ERRORS.INVALID_INPUT_ELEMENT('div'), 'div'],
        [SYSTEM_LIST.ERRORS.DUPLICATE_KEY('id-1', 5), 'id-1'],
        [SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomAttr'), 'atomAttr'],
        [SYSTEM_BINDING.ERRORS.MISSING_CONDITION('atomClass'), 'atomClass'],
      ];

      cases.forEach(([result, expected]) => {
        expect(result).toContain(expected);
      });
    });

    it('should return a non-empty string for zero-argument messages', () => {
      expect(SYSTEM_MOUNT.ERRORS.CLEANUP_ERROR('#sel')).toBeTruthy();
      expect(SYSTEM_CORE.ERRORS.EFFECT_DISPOSE_ERROR('#sel')).toBeTruthy();
      expect(SYSTEM_BINDING.ERRORS.CLEANUP_ERROR('#sel')).toBeTruthy();
    });
  });
});
