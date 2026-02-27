import { describe, expect, it, vi } from 'vitest';
import {
  DEBUG_ID,
  DEBUG_NAME,
  DEBUG_TYPE,
  debug,
  generateId,
  NO_DEFAULT_VALUE,
} from '@/utils/debug';

describe('debug.warn', () => {
  it('outputs warning with prefix when enabled and condition is true', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(true, 'Test warning');
    expect(consoleWarn).toHaveBeenCalledWith('[Atom Effect] Test warning');

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });

  it('is silent when condition is false', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(false, 'Should not warn');
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });

  it('is silent when disabled', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(true, 'Should not warn in production');
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });
});

describe('debug.attachDebugInfo', () => {
  it('attaches name, id, and type symbols when enabled', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: Record<symbol, unknown> = {};
    debug.attachDebugInfo(obj, 'test', 123);

    expect(obj[DEBUG_NAME]).toBe('test_123');
    expect(obj[DEBUG_ID]).toBe(123);
    expect(obj[DEBUG_TYPE]).toBe('test');

    debug.enabled = originalEnabled;
  });

  it('attaches nothing when disabled', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const obj = {};
    debug.attachDebugInfo(obj, 'test', 456);

    expect((obj as Record<symbol, unknown>)[DEBUG_NAME]).toBeUndefined();

    debug.enabled = originalEnabled;
  });
});

describe('debug.getDebugName / getDebugType', () => {
  it('returns name and type set by attachDebugInfo', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj = {};
    debug.attachDebugInfo(obj, 'atom', 1);

    expect(debug.getDebugName(obj)).toBe('atom_1');
    expect(debug.getDebugType(obj)).toBe('atom');

    debug.enabled = originalEnabled;
  });

  it('returns undefined for plain objects and null/undefined inputs', () => {
    expect(debug.getDebugName({})).toBeUndefined();
    expect(debug.getDebugType({})).toBeUndefined();
    expect(debug.getDebugName(null)).toBeUndefined();
    expect(debug.getDebugName(undefined)).toBeUndefined();
  });
});

describe('NO_DEFAULT_VALUE', () => {
  it('is a symbol distinct from common falsy values', () => {
    expect(typeof NO_DEFAULT_VALUE).toBe('symbol');
    expect(NO_DEFAULT_VALUE).not.toBe(undefined);
    expect(NO_DEFAULT_VALUE).not.toBe(null);
  });
});

describe('generateId', () => {
  it('returns monotonically increasing integers', () => {
    const a = generateId();
    const b = generateId();
    const c = generateId();

    expect(typeof a).toBe('number');
    expect(b).toBe(a + 1);
    expect(c).toBe(a + 2);
  });
});
