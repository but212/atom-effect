/**
 * @fileoverview Debug utility tests (coverage supplement)
 */

import { describe, expect, it, vi } from 'vitest';
import { ComputedError } from '@/errors/errors';
import type { Dependency } from '@/types';
import { DEBUG_ID, DEBUG_NAME, DEBUG_TYPE, debug, NO_DEFAULT_VALUE } from '@/utils/debug';

describe('debug configuration', () => {
  it('development mode detection works', () => {
    // enabled is set based on NODE_ENV
    expect(typeof debug.enabled).toBe('boolean');
  });

  it('warnInfiniteLoop default value is true', () => {
    expect(debug.warnInfiniteLoop).toBe(true);
  });
});

describe('debug.warn', () => {
  it('outputs warning when condition is true', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(true, 'Test warning');

    expect(consoleWarn).toHaveBeenCalledWith('[Atom Effect] Test warning');

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });

  it('does not output warning when condition is false', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(false, 'Should not warn');

    expect(consoleWarn).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });

  it('does not output warning when not in development mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(true, 'Should not warn in production');

    expect(consoleWarn).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });
});

describe('debug.checkCircular', () => {
  it('detects direct circular reference', () => {
    const node = {} as Dependency;

    expect(() => {
      debug.checkCircular(node, node);
    }).toThrow(ComputedError);

    expect(() => {
      debug.checkCircular(node, node);
    }).toThrow(/circular dependency/i);
  });

  it('detects indirect circular reference (development mode)', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const nodeA = { id: 1, dependencies: [] } as unknown as Dependency;
    const nodeB = { id: 2, dependencies: [nodeA] } as unknown as Dependency;
    const nodeC = { id: 3, dependencies: [nodeB] } as unknown as Dependency;
    (nodeA as unknown as { dependencies: unknown[] }).dependencies.push(nodeC); // A → C → B → A

    expect(() => {
      debug.checkCircular(nodeC, nodeA);
    }).toThrow(ComputedError);

    debug.enabled = originalEnabled;
  });

  it('does not check indirect circular reference in production mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const nodeA = { dependencies: [] } as unknown as Dependency;
    const nodeB = { dependencies: [nodeA] } as unknown as Dependency;
    const nodeC = { dependencies: [nodeB] } as unknown as Dependency;
    (nodeA as unknown as { dependencies: unknown[] }).dependencies.push(nodeC);

    // No error in production (for performance)
    // However, direct circular is still detected
    expect(() => {
      debug.checkCircular(nodeB, nodeA); // indirect circular
    }).not.toThrow();

    debug.enabled = originalEnabled;
  });

  it('handles nodes without dependencies', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const node1 = {} as Dependency;
    const node2 = { dependencies: [] } as unknown as Dependency;

    expect(() => {
      debug.checkCircular(node1, node2);
    }).not.toThrow();

    debug.enabled = originalEnabled;
  });

  it('checks recursively with epoch-based optimization', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const nodeA = { dependencies: [] } as unknown as Dependency;
    const nodeB = { dependencies: [nodeA] } as unknown as Dependency;

    // Should not throw for non-circular dependency
    expect(() => {
      debug.checkCircular(nodeB, {});
    }).not.toThrow();

    debug.enabled = originalEnabled;
  });
});

describe('debug.attachDebugInfo', () => {
  it('attaches debug info in development mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: Record<symbol, unknown> = {};
    debug.attachDebugInfo(obj, 'test', 123);

    expect(obj[DEBUG_NAME]).toBe('test_123');
    expect(obj[DEBUG_ID]).toBe(123);
    expect(obj[DEBUG_TYPE]).toBe('test');

    debug.enabled = originalEnabled;
  });

  it('does not attach debug info in production mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const obj = {};
    debug.attachDebugInfo(obj, 'test', 456);

    expect((obj as Record<symbol, unknown>)[DEBUG_NAME]).toBeUndefined();
    expect((obj as Record<symbol, unknown>)[DEBUG_ID]).toBeUndefined();
    expect((obj as Record<symbol, unknown>)[DEBUG_TYPE]).toBeUndefined();

    debug.enabled = originalEnabled;
  });
});

describe('debug.getDebugName', () => {
  it('returns debug name', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj = {};
    debug.attachDebugInfo(obj, 'atom', 1);

    expect(debug.getDebugName(obj)).toBe('atom_1');

    debug.enabled = originalEnabled;
  });

  it('returns undefined when debug info is not present', () => {
    const obj = {};
    expect(debug.getDebugName(obj)).toBeUndefined();
  });

  it('handles null and undefined', () => {
    expect(debug.getDebugName(null)).toBeUndefined();
    expect(debug.getDebugName(undefined)).toBeUndefined();
  });
});

describe('debug.getDebugType', () => {
  it('returns debug type', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj = {};
    debug.attachDebugInfo(obj, 'computed', 2);

    expect(debug.getDebugType(obj)).toBe('computed');

    debug.enabled = originalEnabled;
  });

  it('returns undefined when debug info is not present', () => {
    const obj = {};
    expect(debug.getDebugType(obj)).toBeUndefined();
  });

  it('handles null and undefined', () => {
    expect(debug.getDebugType(null)).toBeUndefined();
    expect(debug.getDebugType(undefined)).toBeUndefined();
  });
});

describe('NO_DEFAULT_VALUE Symbol', () => {
  it('is a unique Symbol', () => {
    expect(typeof NO_DEFAULT_VALUE).toBe('symbol');
  });

  it('is distinguishable from other values', () => {
    expect(NO_DEFAULT_VALUE).not.toBe(undefined);
    expect(NO_DEFAULT_VALUE).not.toBe(null);
    expect(NO_DEFAULT_VALUE).not.toBe(0);
    expect(NO_DEFAULT_VALUE).not.toBe(false);
  });
});
