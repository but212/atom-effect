import { describe, expect, it } from 'vitest';
import {
  SYSTEM_BINDING,
  SYSTEM_CORE,
  SYSTEM_LIST,
  SYSTEM_MOUNT,
  SYSTEM_SECURITY,
} from '@/constants';

describe('Constants', () => {
  describe('ERROR_MESSAGES', () => {
    it('should interpolate dynamic arguments into the message', () => {
      const cases: [string, string][] = [
        [SYSTEM_SECURITY.ERRORS.BLOCKED_EVENT_HANDLER('onclick'), 'onclick'],
        [SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL('href'), 'href'],
        [SYSTEM_SECURITY.ERRORS.BLOCKED_PROP('innerHTML'), 'innerHTML'],
        [SYSTEM_BINDING.ERRORS.INVALID_INPUT_ELEMENT('div'), 'div'],
        [SYSTEM_LIST.ERRORS.DUPLICATE_KEY('id-1', 5), 'id-1'],
        [SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomAttr'), 'atomAttr'],
        [SYSTEM_BINDING.ERRORS.MISSING_CONDITION('atomClass'), 'atomClass'],
      ];

      for (const [result, expected] of cases) {
        expect(result).toContain(expected);
      }
    });

    it('should include the identifier when provided and omit it when absent', () => {
      const templates = [
        SYSTEM_MOUNT.ERRORS.CLEANUP_ERROR,
        SYSTEM_CORE.ERRORS.EFFECT_DISPOSE_ERROR,
        SYSTEM_BINDING.ERRORS.CLEANUP_ERROR,
      ];

      for (const template of templates) {
        const withIdentifier = template('#sel');
        const withoutIdentifier = template();

        expect(withIdentifier).toContain('#sel');
        expect(withoutIdentifier.length).toBeGreaterThan(0);
        expect(withoutIdentifier).not.toContain('undefined');
        expect(withIdentifier).not.toBe(withoutIdentifier);
      }
    });
  });
});
