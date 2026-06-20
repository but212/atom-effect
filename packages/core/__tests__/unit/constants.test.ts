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

    it('should evaluate to true if __ATOM_DEBUG__ is set on globalThis', async () => {
      const origEnv = process.env.NODE_ENV;
      const origDev = import.meta.env?.DEV;
      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        (globalThis as Record<string, unknown>).__ATOM_DEBUG__ = true;
        // @ts-expect-error
        const mod = await import('../../src/constants?debug=1');
        expect(mod.IS_DEV).toBe(true);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = origDev;
        }
        (globalThis as Record<string, unknown>).__ATOM_DEBUG__ = undefined;
      }
    });

    it('should evaluate to true if sessionStorage has __ATOM_DEBUG__', async () => {
      const origEnv = process.env.NODE_ENV;
      const origDev = import.meta.env?.DEV;
      const mockSessionStorage = {
        getItem: (key: string) => (key === '__ATOM_DEBUG__' ? 'true' : null),
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 1,
        key: () => null,
      };

      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        (globalThis as Record<string, unknown>).sessionStorage = mockSessionStorage;
        // @ts-expect-error
        const mod = await import('../../src/constants?debug=2');
        expect(mod.IS_DEV).toBe(true);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = origDev;
        }
        (globalThis as Record<string, unknown>).sessionStorage = undefined;
      }
    });

    it('should evaluate to true if __DEV__ is defined', async () => {
      const origEnv = process.env.NODE_ENV;
      const origDev = import.meta.env?.DEV;
      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        (globalThis as Record<string, unknown>).__DEV__ = true;
        // @ts-expect-error
        const mod = await import('../../src/constants?debug=4');
        expect(mod.IS_DEV).toBe(true);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = origDev;
        }
        (globalThis as Record<string, unknown>).__DEV__ = undefined;
      }
    });

    it('should evaluate to false if all dev indicators are missing', async () => {
      const origEnv = process.env.NODE_ENV;
      const origDev = import.meta.env?.DEV;

      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        // @ts-expect-error
        const mod = await import('../../src/constants?debug=3');
        expect(mod.IS_DEV).toBe(false);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = origDev;
        }
      }
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
