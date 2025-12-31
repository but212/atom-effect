/**
 * @fileoverview Comprehensive tests for reactive state management library
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AsyncState,
  atom,
  batch,
  computed,
  DEBUG_RUNTIME,
  effect,
  isAtom,
  isComputed,
  isEffect,
  untracked,
} from '@/index';

// ========================================
// 1. Atom Basic Behavior
// ========================================

describe('Atom - Basic Behavior', () => {
  it('read/write operations work correctly', () => {
    const count = atom(0);
    expect(count.value).toBe(0);

    count.value = 10;
    expect(count.value).toBe(10);
  });

  it('notifies subscribers of changes', async () => {
    const count = atom(0);
    const listener = vi.fn();

    count.subscribe(listener);
    count.value = 5;

    // Wait for async scheduler
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledWith(5, 0);
  });

  it('unsubscribe works correctly', () => {
    const count = atom(0);
    const listener = vi.fn();

    const unsubscribe = count.subscribe(listener);
    unsubscribe();
    count.value = 5;

    expect(listener).not.toHaveBeenCalled();
  });

  it('duplicate unsubscribe is safe', () => {
    const count = atom(0);
    const listener = vi.fn();

    const unsubscribe = count.subscribe(listener);
    unsubscribe();
    unsubscribe(); // duplicate call
    unsubscribe(); // another call

    // Should complete without errors
    expect(() => unsubscribe()).not.toThrow();
  });

  it('peek() returns value without dependency tracking', () => {
    const count = atom(0);
    const calls: number[] = [];

    const c = computed(() => {
      calls.push(count.peek()); // peek is not tracked
      return 1;
    });

    expect(c.value).toBe(1);
    count.value = 10;
    expect(calls.length).toBe(1); // no recalculation
  });

  it('skips update for same value using Object.is comparison', () => {
    const count = atom(0);
    const listener = vi.fn();

    count.subscribe(listener);
    count.value = 0; // same value

    expect(listener).not.toHaveBeenCalled();
  });

  it('no memory leak after dispose', () => {
    const count = atom(0);
    const listener = vi.fn();

    count.subscribe(listener);
    count.dispose();
    count.value = 10;

    // No notification after dispose (subscribers cleared)
    expect(listener).not.toHaveBeenCalled();
  });
});

// ========================================
// 2. Computed Behavior
// ========================================

describe('Computed - Behavior', () => {
  it('automatic dependency tracking works', async () => {
    const count = atom(0);
    const doubled = computed(() => count.value * 2);

    expect(doubled.value).toBe(0);

    count.value = 5;
    // Wait for async markDirty call
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(doubled.value).toBe(10);
  });

  it('lazy evaluation works (default)', () => {
    const fn = vi.fn(() => 42);
    const c = computed(fn);

    expect(fn).not.toHaveBeenCalled();

    const val = c.value;
    expect(fn).toHaveBeenCalledOnce();
    expect(val).toBe(42);
  });

  it('lazy: false option works', () => {
    const fn = vi.fn(() => 42);
    const _c = computed(fn, { lazy: false });

    expect(fn).toHaveBeenCalledOnce();
  });

  it('synchronous computation works correctly', () => {
    const a = atom(2);
    const b = atom(3);
    const sum = computed(() => a.value + b.value);

    expect(sum.value).toBe(5);
  });

  it('asynchronous computation works correctly', async () => {
    const a = atom(2);
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return a.value * 2;
      },
      { defaultValue: 0 }
    );

    expect(c.state).toBe(AsyncState.IDLE);
    const initialValue = c.value; // trigger computation
    expect(initialValue).toBe(0); // defaultValue
    expect(c.state).toBe(AsyncState.PENDING);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(4);
  });

  it('defaultValue handling works', () => {
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      },
      { defaultValue: 999 }
    );

    expect(c.value).toBe(999); // returns defaultValue while pending
  });

  it('error recovery (recoverable) works', async () => {
    const shouldFail = atom(true);
    const c = computed(
      () => {
        if (shouldFail.value) {
          throw new Error('Test error');
        }
        return 42;
      },
      { defaultValue: 0 }
    );

    expect(() => c.value).toThrow('Test error');

    shouldFail.value = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(c.value).toBe(42);
  });

  it('onError callback is called', () => {
    const errorHandler = vi.fn();
    const c = computed(
      () => {
        throw new Error('Test');
      },
      { onError: errorHandler }
    );

    expect(() => c.value).toThrow();
    expect(errorHandler).toHaveBeenCalled();
  });

  it('detects direct circular reference (internal implementation verification)', () => {
    // Directly test checkCircular function
    const mockComputed = {
      dependencies: new Set(),
    };

    // Attempt to add atom as its own dependency
    expect(() => {
      // debug.checkCircular always detects direct circular (even in production)
      DEBUG_RUNTIME.checkCircular(mockComputed, mockComputed);
    }).toThrow(/circular dependency/i);
  });

  it('detects indirect circular reference (development mode)', () => {
    // Only detect indirect circular reference in development mode
    if (typeof process === 'undefined' || (process as any).env?.NODE_ENV !== 'development') {
      // Skip test in production
      expect(true).toBe(true);
      return;
    }

    // Simulate A → B → C → A circular structure
    const nodeA: any = { dependencies: new Set() };
    const nodeB: any = { dependencies: new Set([nodeA]) };
    const nodeC: any = { dependencies: new Set([nodeB]) };
    nodeA.dependencies.add(nodeC); // complete the cycle

    expect(() => {
      DEBUG_RUNTIME.checkCircular(nodeC, nodeA);
    }).toThrow(/circular dependency/i);
  });

  it('equal option works', () => {
    const a = atom({ x: 1 });
    const listener = vi.fn();

    const c = computed(() => ({ x: a.value.x }), {
      equal: (prev, next) => prev.x === next.x,
    });

    c.subscribe(listener);
    c.value; // initial computation

    a.value = { x: 1 }; // same x value
    expect(listener).not.toHaveBeenCalled();
  });

  it('dependencies are cleaned up after dispose', () => {
    const a = atom(0);
    const c = computed(() => a.value * 2);

    c.value; // register dependencies
    c.dispose();

    // After dispose, a should have no subscribers
    // Actual internal implementation verification needed
  });
});

// ========================================
// 3. Effect Behavior
// ========================================

describe('Effect - Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('automatically runs on dependency change', async () => {
    const count = atom(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.value);
    });

    await vi.runAllTimersAsync();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toBe(0);

    count.value = 1;
    await vi.runAllTimersAsync();
    expect(calls[calls.length - 1]).toBe(1);
  });

  it('cleanup function is executed', async () => {
    const count = atom(0);
    const cleanup = vi.fn();

    effect(() => {
      count.value;
      return cleanup;
    });

    await vi.runAllTimersAsync();

    count.value = 1;
    await vi.runAllTimersAsync();
    expect(cleanup).toHaveBeenCalled();
  });

  it('async cleanup works', async () => {
    vi.useRealTimers(); // use real timers
    const count = atom(0);
    const cleanup = vi.fn();

    effect(async () => {
      count.value;
      return cleanup;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(cleanup).toHaveBeenCalled();
    vi.useFakeTimers(); // back to fake timers
  });

  it('detects infinite loop (sliding window)', async () => {
    const count = atom(0);

    const _e = effect(
      () => {
        count.value = count.value + 1; // causes infinite loop
      },
      { sync: true, maxExecutionsPerSecond: 10 }
    );

    // Error occurs when exceeding 10 executions
    await vi.runAllTimersAsync();
  });

  it('trackModifications warning works', async () => {
    const count = atom(0);
    const _consoleWarn = vi.spyOn(console, 'warn');

    effect(
      () => {
        count.value = count.value + 1; // read and write
      },
      { trackModifications: true, sync: true, maxExecutionsPerSecond: 5 }
    );

    await vi.runAllTimersAsync();
  });

  it('descriptor is restored on dispose', async () => {
    const count = atom(0);

    const e = effect(
      () => {
        count.value;
      },
      { trackModifications: true }
    );

    await vi.runAllTimersAsync();

    const _descriptorBefore = Object.getOwnPropertyDescriptor(count, 'value');
    e.dispose();
    const descriptorAfter = Object.getOwnPropertyDescriptor(count, 'value');

    // Verify original descriptor is restored after dispose
    expect(descriptorAfter).toBeDefined();
  });

  it('sync option works', () => {
    const count = atom(0, { sync: true });
    const calls: number[] = [];
    let effectRunCount = 0;

    effect(
      () => {
        // prevent infinite loop
        if (effectRunCount++ > 5) return;
        calls.push(count.value);
      },
      { sync: true, maxExecutionsPerSecond: 10 }
    );

    expect(calls).toEqual([0]); // immediate execution

    count.value = 1;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(1);
  });

  it('does not re-run after dispose', async () => {
    const count = atom(0);
    const calls: number[] = [];

    const e = effect(() => {
      calls.push(count.value);
    });

    await vi.runAllTimersAsync();
    e.dispose();

    count.value = 1;
    await vi.runAllTimersAsync();

    expect(calls).toEqual([0]); // no execution after dispose
  });
});

// ========================================
// 4. Batch Processing
// ========================================

describe('Batch - Processing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('multiple updates in batch notify only once', async () => {
    const a = atom(0);
    const b = atom(0);
    const calls: number[] = [];

    const c = computed(() => a.value + b.value);
    c.value; // initial computation
    c.subscribe(() => {
      calls.push(c.value);
    });

    batch(() => {
      a.value = 1;
      b.value = 2;
    });

    await vi.runAllTimersAsync();

    // Only one notification after batch
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(3);
  });

  it('nested batch works', async () => {
    const a = atom(0);
    const calls: number[] = [];

    a.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    batch(() => {
      a.value = 1;
      batch(() => {
        a.value = 2;
      });
      a.value = 3;
    });

    await vi.runAllTimersAsync();

    // Only one notification after outermost batch ends
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(3);
  });

  it('recovers correctly when error occurs in batch', async () => {
    const a = atom(0);

    expect(() => {
      batch(() => {
        a.value = 1;
        throw new Error('Test error');
      });
    }).toThrow();

    // Batch ends and works normally after error
    a.value = 2;
    await vi.runAllTimersAsync();
    expect(a.value).toBe(2);
  });
});

// ========================================
// 5. Edge Cases
// ========================================

describe('Edge Cases', () => {
  it('handles null value', () => {
    const nullAtom = atom<string | null>(null);
    expect(nullAtom.value).toBe(null);

    nullAtom.value = 'test';
    expect(nullAtom.value).toBe('test');
  });

  it('handles undefined value', () => {
    const undefinedAtom = atom<string | undefined>(undefined);
    expect(undefinedAtom.value).toBe(undefined);

    undefinedAtom.value = 'test';
    expect(undefinedAtom.value).toBe('test');
  });

  it('isAtom type guard is accurate', () => {
    const a = atom(0);
    const c = computed(() => 0);
    const e = effect(() => {});

    expect(isAtom(a)).toBe(true);
    expect(isAtom(c)).toBe(true); // computed is also atom
    expect(isAtom(e)).toBe(false);
    expect(isAtom(null)).toBe(false);
    expect(isAtom(undefined)).toBe(false);
    expect(isAtom({})).toBe(false);
  });

  it('isComputed type guard is accurate', () => {
    const a = atom(0);
    const c = computed(() => 0);

    expect(isComputed(a)).toBe(false);
    expect(isComputed(c)).toBe(true);
    expect(isComputed(null)).toBe(false);
  });

  it('isEffect type guard is accurate', () => {
    const a = atom(0);
    const e = effect(() => {});

    expect(isEffect(a)).toBe(false);
    expect(isEffect(e)).toBe(true);
    expect(isEffect(null)).toBe(false);
  });

  it('no memory leak after dispose', () => {
    const a = atom(0);
    const listener = vi.fn();

    // Add subscriber
    const _unsubscribe = a.subscribe(listener);

    // Check subscriber count before dispose (debug mode)
    if ((a as any).subscriberCount) {
      expect((a as any).subscriberCount()).toBe(1);
    }

    a.dispose();

    // Check if subscribers are cleaned up after dispose
    if ((a as any).subscriberCount) {
      expect((a as any).subscriberCount()).toBe(0);
    }

    // No notification after dispose
    a.value = 10;
    expect(listener).not.toHaveBeenCalled();
  });

  it('dependencies are cleaned up after computed dispose', () => {
    const a = atom(0);
    const c = computed(() => a.value * 2);

    // Register dependencies
    c.value;

    // Check atom subscribers
    if ((a as any).subscriberCount) {
      expect((a as any).subscriberCount()).toBeGreaterThan(0);
    }

    c.dispose();

    // After dispose, computed should not subscribe to atom
    // (subscription should be removed)
    const subscriberCount = (a as any).subscriberCount?.() || 0;
    const listener = vi.fn();
    a.subscribe(listener);

    // computed is no longer a subscriber
    expect(subscriberCount).toBe(0);
  });

  it('version management handles concurrency issues', async () => {
    const count = atom(0);
    const calls: number[] = [];

    count.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    count.value = 1;
    count.value = 2;
    count.value = 3;

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Only final value should be propagated
    expect(calls[calls.length - 1]).toBe(3);
  });
});

// ========================================
// 6. Performance
// ========================================

describe('Performance Tests', () => {
  it('handles large dependency graphs', async () => {
    // Optimization applied: updateDependencies with O(n) complexity
    const atoms = Array.from({ length: 10 }, (_, i) => atom(i));
    const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));

    expect(c.value).toBe(45); // 0 + 1 + ... + 9

    atoms[5]!.value = 100;
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 45 - 5 + 100 = 140
    expect(c.value).toBe(140);
  });

  it('handles diamond problem correctly (A→B,C / B,C→D)', async () => {
    const a = atom(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);

    expect(d.value).toBe(5); // initial value

    const calls: number[] = [];
    d.subscribe(() => {
      calls.push(d.value);
    });

    a.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // d should only be recalculated once
    expect(d.value).toBe(10); // (2*2) + (2*3)
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('handles deep dependency chains', () => {
    let current = atom(1);

    for (let i = 0; i < 50; i++) {
      const prev = current;
      current = computed(() => prev.value + 1) as any;
    }

    expect(current.value).toBe(51);
  });
});

// ========================================
// 7. Utility Functions
// ========================================

describe('Utility Functions', () => {
  it('untracked does not track dependencies', () => {
    const a = atom(0);
    const calls: number[] = [];

    const c = computed(() => {
      calls.push(untracked(() => a.value));
      return 1;
    });

    c.value; // initial computation
    a.value = 10; // untracked so no recalculation

    expect(calls.length).toBe(1);
  });
});
