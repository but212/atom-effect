import { describe, expect, it } from 'vitest';
import { AsyncState, IS_DEV, SCHEDULER_CONFIG } from '@/index';

const DEV_INDICATORS = ['__ATOM_DEBUG__', '__DEV__', 'sessionStorage'] as const;

type GlobalValues = Record<string, unknown>;

function isolateDevIndicators(): () => void {
  const target = globalThis as GlobalValues;
  const snapshots = DEV_INDICATORS.map((key) => ({
    key,
    hadValue: Object.hasOwn(target, key),
    value: target[key],
  }));

  for (const key of DEV_INDICATORS) Reflect.deleteProperty(target, key);

  return () => {
    for (const snapshot of snapshots) {
      if (snapshot.hadValue) target[snapshot.key] = snapshot.value;
      else Reflect.deleteProperty(target, snapshot.key);
    }
  };
}

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
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDevFlag = import.meta.env?.DEV;
      const restoreDevIndicators = isolateDevIndicators();
      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        (globalThis as GlobalValues).__ATOM_DEBUG__ = true;
        // @ts-expect-error
        const constantsModule = await import('../../src/constants?debug=1');
        expect(constantsModule.IS_DEV).toBe(true);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = originalDevFlag;
        }
        restoreDevIndicators();
      }
    });

    it('should evaluate to true if sessionStorage has __ATOM_DEBUG__', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDevFlag = import.meta.env?.DEV;
      const restoreDevIndicators = isolateDevIndicators();
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

        (globalThis as GlobalValues).sessionStorage = mockSessionStorage;
        // @ts-expect-error
        const constantsModule = await import('../../src/constants?debug=2');
        expect(constantsModule.IS_DEV).toBe(true);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = originalDevFlag;
        }
        restoreDevIndicators();
      }
    });

    it('should evaluate to true if __DEV__ is defined', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDevFlag = import.meta.env?.DEV;
      const restoreDevIndicators = isolateDevIndicators();
      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        (globalThis as GlobalValues).__DEV__ = true;
        // @ts-expect-error
        const constantsModule = await import('../../src/constants?debug=4');
        expect(constantsModule.IS_DEV).toBe(true);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = originalDevFlag;
        }
        restoreDevIndicators();
      }
    });

    it('should evaluate to false if all dev indicators are missing', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDevFlag = import.meta.env?.DEV;
      const restoreDevIndicators = isolateDevIndicators();

      try {
        process.env.NODE_ENV = 'production';
        if (import.meta.env) {
          // @ts-expect-error - modifying readonly property for testing
          import.meta.env.DEV = false;
        }

        // @ts-expect-error
        const constantsModule = await import('../../src/constants?debug=3');
        expect(constantsModule.IS_DEV).toBe(false);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (import.meta.env) {
          // @ts-expect-error - restoring readonly property
          import.meta.env.DEV = originalDevFlag;
        }
        restoreDevIndicators();
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
