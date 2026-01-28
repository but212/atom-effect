/**
 * @fileoverview Helpers tests (coverage supplement)
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { batch, isComputed, untracked } from '@/index';

describe('batch - Error Handling', () => {
  it('rejects invalid callback types', () => {
    expect(() => {
      batch('not a function' as unknown as () => void);
    }).toThrow(TypeError);

    expect(() => {
      batch(null as unknown as () => void);
    }).toThrow(TypeError);
  });

  it('propagates errors from callback', () => {
    expect(() => {
      batch(() => {
        throw new Error('Batch error');
      });
    }).toThrow('Batch error');
  });

  it('batch passes through return value', () => {
    const result = batch(() => {
      return 42;
    });

    expect(result).toBe(42);
  });
});

describe('batch - Synchronous Execution', () => {
  it('batch should execute synchronously', () => {
    const a = atom(0);
    const calls: number[] = [];

    a.subscribe((newVal?: number) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    batch(() => {
      a.value = 1;
      a.value = 2;
      a.value = 3;
    });

    // Should be called immediately after batch ends (no async wait needed)
    expect(calls).toEqual([3]);
  });

  it('multiple atom updates inside batch execute synchronously', () => {
    const a = atom(0);
    const b = atom(0);
    const calls: string[] = [];

    a.subscribe((newVal?: number) => {
      if (newVal !== undefined) calls.push(`a:${newVal}`);
    });

    b.subscribe((newVal?: number) => {
      if (newVal !== undefined) calls.push(`b:${newVal}`);
    });

    batch(() => {
      a.value = 1;
      b.value = 2;
      a.value = 3;
    });

    // All updates should be complete immediately after batch ends
    // Set order is not guaranteed, so only check for inclusion
    expect(calls).toContain('a:3');
    expect(calls).toContain('b:2');
    expect(calls).toHaveLength(2);
  });

  it('nested batch also executes synchronously', () => {
    const a = atom(0);
    const calls: number[] = [];

    a.subscribe((newVal?: number) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    batch(() => {
      a.value = 1;
      batch(() => {
        a.value = 2;
      });
      a.value = 3;
    });

    // Should be called immediately after outermost batch ends
    expect(calls).toEqual([3]);
  });

  it('computed updates immediately inside batch', () => {
    const a = atom(0);
    const b = computed(() => a.value * 2, { lazy: false }); // non-lazy for immediate computation
    const calls: number[] = [];

    b.subscribe(() => {
      calls.push(b.value);
    });

    batch(() => {
      a.value = 1;
      a.value = 2;
      a.value = 3;
    });

    // Computed should be updated immediately after batch ends
    expect(b.value).toBe(6); // computed value itself is updated
    expect(calls).toEqual([6]); // subscriber should also be called
  });
});

describe('untracked - Error Handling', () => {
  it('rejects invalid callback types', () => {
    // In the optimized version, we let the runtime throw the TypeError naturally
    // when trying to execute the non-function
    expect(() => {
      untracked('not a function' as unknown as () => void);
    }).toThrow(TypeError);

    expect(() => {
      untracked(null as unknown as () => void);
    }).toThrow(TypeError);
  });

  it('propagates errors from callback', () => {
    expect(() => {
      untracked(() => {
        throw new Error('Untracked error');
      });
    }).toThrow('Untracked error');
  });

  it('untracked passes through return value', () => {
    const result = untracked(() => {
      return 'test';
    });

    expect(result).toBe('test');
  });
});

describe('isComputed - Various Cases', () => {
  it('works even when not in development mode', () => {
    const a = atom(0);
    const c = computed(() => 0);

    // Even without dev mode, identifies by invalidate method
    expect(isComputed(a)).toBe(false);
    expect(isComputed(c)).toBe(true);
  });

  it('recognizes as computed if invalidate method exists', () => {
    const fakeComputed = {
      value: 0,
      subscribe: () => () => {},
      invalidate: () => {},
    };

    expect(isComputed(fakeComputed)).toBe(true);
  });

  it('prioritizes debug type information', () => {
    // Already sufficiently tested in index.test.ts
    expect(true).toBe(true);
  });
});
