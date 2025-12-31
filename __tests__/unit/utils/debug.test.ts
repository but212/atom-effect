/**
 * @fileoverview Debug utility tests (coverage supplement)
 */

import { ComputedError } from '@/errors/errors';
import { debug, DEBUG_ID, DEBUG_NAME, DEBUG_TYPE, NO_DEFAULT_VALUE } from '@/utils/debug';
import { describe, expect, it, vi } from 'vitest';

describe('debug configuration', () => {
  it('development mode detection works', () => {
    // enabled is set based on NODE_ENV
    expect(typeof debug.enabled).toBe('boolean');
  });

  it('maxDependencies default value is set', () => {
    expect(debug.maxDependencies).toBe(1000);
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

    expect(consoleWarn).toHaveBeenCalledWith('[Reactive Atom] Test warning');

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
    const node = {};

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

    const nodeA: any = { dependencies: new Set() };
    const nodeB: any = { dependencies: new Set([nodeA]) };
    const nodeC: any = { dependencies: new Set([nodeB]) };
    nodeA.dependencies.add(nodeC); // A → C → B → A

    expect(() => {
      debug.checkCircular(nodeC, nodeA);
    }).toThrow(ComputedError);

    debug.enabled = originalEnabled;
  });

  it('does not check indirect circular reference in production mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const nodeA: any = { dependencies: new Set() };
    const nodeB: any = { dependencies: new Set([nodeA]) };
    const nodeC: any = { dependencies: new Set([nodeB]) };
    nodeA.dependencies.add(nodeC);

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

    const node1 = {};
    const node2 = { dependencies: new Set() };

    expect(() => {
      debug.checkCircular(node1, node2);
    }).not.toThrow();

    debug.enabled = originalEnabled;
  });

  it('checks recursively when visited Set is provided', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const visited = new Set();
    const node = {};

    debug.checkCircular(node, {}, visited);
    expect(visited.has(node)).toBe(true);

    debug.enabled = originalEnabled;
  });
});

describe('debug.attachDebugInfo', () => {
  it('attaches debug info in development mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: any = {};
    debug.attachDebugInfo(obj, 'test', 123);

    expect(obj[DEBUG_NAME]).toBe('test_123');
    expect(obj[DEBUG_ID]).toBe(123);
    expect(obj[DEBUG_TYPE]).toBe('test');

    debug.enabled = originalEnabled;
  });

  it('does not attach debug info in production mode', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const obj: any = {};
    debug.attachDebugInfo(obj, 'test', 456);

    expect(obj[DEBUG_NAME]).toBeUndefined();
    expect(obj[DEBUG_ID]).toBeUndefined();
    expect(obj[DEBUG_TYPE]).toBeUndefined();

    debug.enabled = originalEnabled;
  });
});

describe('debug.getDebugName', () => {
  it('returns debug name', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: any = {};
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

    const obj: any = {};
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
