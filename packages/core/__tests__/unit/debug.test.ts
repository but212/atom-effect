import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBUG_ID, DEBUG_NAME, debug, generateId, NO_DEFAULT_VALUE } from '@/utils/debug';

describe('Debug Utilities', () => {
  let originalEnabled: boolean;
  let originalWarnLoop: boolean;

  beforeEach(() => {
    // Preserve state to avoid side effects between test runs
    originalEnabled = debug.enabled;
    originalWarnLoop = debug.warnInfiniteLoop;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    debug.enabled = originalEnabled;
    debug.warnInfiniteLoop = originalWarnLoop;
    vi.restoreAllMocks();
  });

  describe('Diagnostic Feedback (debug.warn)', () => {
    it('outputs warning with prefix when enabled and condition is true', () => {
      debug.enabled = true;
      debug.warn(true, 'Test message');
      expect(console.warn).toHaveBeenCalledWith('[Atom Effect] Test message');
    });

    it('is silent when condition is false or debugging is disabled', () => {
      debug.enabled = true;
      debug.warn(false, 'Silent');

      debug.enabled = false;
      debug.warn(true, 'Silent');

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('Metadata Management (attachDebugInfo)', () => {
    /**
     * Verifies that debug info is correctly attached to objects and can be retrieved.
     * Merged from redundant "Coverage Gaps" and "Strategic Gaps" tests.
     */
    it('round-trips debug information on objects when enabled', () => {
      debug.enabled = true;
      const obj: Record<symbol, unknown> = {};
      const id = 123;

      debug.attachDebugInfo(obj, 'test-type', id);

      expect(debug.getDebugName(obj)).toBe(`test-type_${id}`);
      expect(debug.getDebugType(obj)).toBe('test-type');
      expect(obj[DEBUG_ID]).toBe(id);

      // Verify non-enumerable: symbols should not appear in keys
      expect(Object.keys(obj)).toHaveLength(0);
      expect(Object.getOwnPropertySymbols(obj)).toContain(DEBUG_NAME);
    });

    it('supports custom names for improved traceability', () => {
      debug.enabled = true;
      const obj = {};
      debug.attachDebugInfo(obj, 'atom', 777, 'MyCustomName');
      expect(debug.getDebugName(obj)).toBe('MyCustomName');
    });

    it('does nothing when debugging is disabled', () => {
      debug.enabled = false;
      const obj = {};
      debug.attachDebugInfo(obj, 'type', 1);
      expect(debug.getDebugName(obj)).toBeUndefined();
    });

    it('handles null/undefined safety for getters', () => {
      expect(debug.getDebugName(null)).toBeUndefined();
      expect(debug.getDebugType(undefined)).toBeUndefined();
      expect(debug.getDebugName({})).toBeUndefined();
    });
  });

  describe('Infinite Loop Detection (trackUpdate)', () => {
    it('warns when a dependency updates more than 100 times in a scope', () => {
      debug.enabled = true;
      debug.warnInfiniteLoop = true;
      const debugId = 101;

      // Simulate 101 updates
      for (let i = 0; i < 101; i++) {
        debug.trackUpdate(debugId);
      }

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Infinite loop detected for dependency 101')
      );
    });

    it('remains silent when disabled or below threshold', () => {
      debug.enabled = true;
      debug.warnInfiniteLoop = false;

      for (let i = 0; i < 150; i++) debug.trackUpdate(1);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('Constants and Primitives', () => {
    it('NO_DEFAULT_VALUE is a unique identity symbol', () => {
      expect(typeof NO_DEFAULT_VALUE).toBe('symbol');
      expect(NO_DEFAULT_VALUE).not.toEqual(null);
    });

    it('generateId returns unique monotonically increasing integers', () => {
      const a = generateId();
      const b = generateId();
      expect(b).toBe(a + 1);
    });
  });
});
