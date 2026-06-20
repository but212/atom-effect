import { describe, expect, it } from 'vitest';
import { AsyncState, IS_DEV, SCHEDULER_CONFIG } from '@/index';

describe('Constants Integrity', () => {
  describe('AsyncState', () => {
    it('should have all required state lifecycle values', () => {
      expect(AsyncState.IDLE).toBeDefined();
      expect(AsyncState.PENDING).toBeDefined();
      expect(AsyncState.RESOLVED).toBeDefined();
      expect(AsyncState.REJECTED).toBeDefined();
    });

    it('should be strictly frozen to prevent tampering', () => {
      expect(Object.isFrozen(AsyncState)).toBe(true);
    });
  });

  describe('IS_DEV', () => {
    it('should be correctly evaluated as a boolean', () => {
      expect(typeof IS_DEV).toBe('boolean');
    });
  });

  describe('SCHEDULER_CONFIG', () => {
    it('should expose key thresholds', () => {
      expect(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT).toBeGreaterThan(0);
      expect(SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS).toBeGreaterThan(0);
      expect(Object.isFrozen(SCHEDULER_CONFIG)).toBe(true);
    });
  });
});
