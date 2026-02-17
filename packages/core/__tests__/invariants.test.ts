/**
 * @fileoverview Core Invariant Tests
 * @description Verifies the fundamental behavioral contracts of the reactive system.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  atom,
  batch,
  type ComputedError,
  computed,
  effect,
  isAtom,
  isComputed,
  isEffect,
  scheduler,
  untracked,
} from '../src';
import { waitForScheduler } from './utils/test-helpers';

// biome-ignore lint/suspicious/noExplicitAny: internal version access
const v = (node: any): number => node.version;

// ─── 1. Version Semantics ───────────────────────────────────────────────────

describe('Version Semantics', () => {
  it('atom version increments on change, stays on same-value assignment', () => {
    const a = atom(0);
    const v0 = v(a);

    a.value = 1;
    expect(v(a)).toBe(v0 + 1);

    const v1 = v(a);
    a.value = 1; // same value
    expect(v(a)).toBe(v1);
  });

  it('computed version bumps only on resolution with changed value', () => {
    const src = atom(0);
    const c = computed(() => Math.floor(src.value / 10));
    c.value; // initial resolve → 0
    const v0 = v(c);

    // markDirty does NOT bump version
    c.invalidate();
    expect(v(c)).toBe(v0);

    // same resolved value (floor(5/10)=0) → no bump
    src.value = 5;
    c.value;
    expect(v(c)).toBe(v0);

    // different resolved value → bump
    src.value = 99;
    c.invalidate();
    c.value;
    expect(v(c)).toBeGreaterThan(v0);
  });

  it('computed bumps version on async error', async () => {
    const c = computed(
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        throw new Error('async-fail');
      },
      { defaultValue: -1 }
    );

    c.value; // triggers async → PENDING
    const v0 = v(c);

    await new Promise((r) => setTimeout(r, 30));

    expect(v(c)).toBeGreaterThan(v0);
    expect(c.hasError).toBe(true);
  });
});

// ─── 2. Push-Pull Propagation ───────────────────────────────────────────────

describe('Push-Pull Propagation', () => {
  it('atom notifies async by default, sync when opted in', async () => {
    // Async default
    const asyncAtom = atom(0);
    const asyncCalls: number[] = [];
    asyncAtom.subscribe((val) => asyncCalls.push(val!));

    asyncAtom.value = 1;
    expect(asyncCalls).toEqual([]); // not yet

    await waitForScheduler();
    expect(asyncCalls).toEqual([1]);

    // Sync opt-in
    const syncAtom = atom(0, { sync: true });
    const syncCalls: number[] = [];
    syncAtom.subscribe((val) => syncCalls.push(val!));

    syncAtom.value = 1;
    expect(syncCalls).toEqual([1]); // immediate
  });

  it('effect pulls computed value during dirty check', async () => {
    const src = atom(0);
    let computeCount = 0;
    const c = computed(() => {
      computeCount++;
      return src.value * 2;
    });

    const results: number[] = [];
    const e = effect(() => {
      results.push(c.value);
    });
    expect(computeCount).toBe(1);
    expect(results).toEqual([0]);

    src.value = 5;
    await waitForScheduler();
    expect(results).toContain(10);
    expect(computeCount).toBeGreaterThanOrEqual(2);

    e.dispose();
  });
});

// ─── 3. Dependency Tracking ─────────────────────────────────────────────────

describe('Dependency Tracking', () => {
  it('tracks only accessed dependencies and prunes on branch switch', async () => {
    const toggle = atom(true);
    const a = atom('A');
    const b = atom('B');
    let runs = 0;
    const c = computed(() => {
      runs++;
      return toggle.value ? a.value : b.value;
    });

    expect(c.value).toBe('A');
    expect(runs).toBe(1);

    // b is not tracked
    b.value = 'B2';
    await waitForScheduler();
    c.invalidate();
    expect(c.value).toBe('A');
    expect(runs).toBe(2);

    // switch branch: now c depends on toggle + b
    toggle.value = false;
    c.invalidate();
    expect(c.value).toBe('B2');
    expect(runs).toBe(3);

    // a is pruned
    const runsAfterSwitch = runs;
    a.value = 'A2';
    await waitForScheduler();
    expect(runs).toBe(runsAfterSwitch);
  });

  it('untracked reads do not create dependencies', () => {
    const a = atom(1);
    const b = atom(100);
    const c = computed(() => a.value + untracked(() => b.value));

    expect(c.value).toBe(101);
    b.value = 200;
    expect(c.value).toBe(101); // b not tracked → cached
  });

  it('deduplicates same dependency accessed multiple times', () => {
    const a = atom(1);
    const c = computed(() => a.value + a.value + a.value);
    expect(c.value).toBe(3);
    expect(a.subscriberCount()).toBe(1);
  });
});

// ─── 4. Batch Guarantees ────────────────────────────────────────────────────

describe('Batch Guarantees', () => {
  it('defers all notifications until outermost batch completes', async () => {
    const a = atom(0);
    const b = atom(0);
    const results: [number, number][] = [];

    effect(() => {
      results.push([a.value, b.value]);
    });
    results.length = 0;

    batch(() => {
      a.value = 1;
      batch(() => {
        b.value = 2;
        a.value = 3;
      });
      b.value = 4;
    });

    await waitForScheduler();
    expect(results).toEqual([[3, 4]]);
  });
});

// ─── 5. Disposal Finality ───────────────────────────────────────────────────

describe('Disposal Finality', () => {
  it('all node types become unusable after dispose and dispose is idempotent', () => {
    const a = atom(42);
    const c = computed(() => a.value);
    c.value; // resolve
    const e = effect(() => {
      void c.value;
    });

    // First dispose
    a.dispose();
    c.dispose();
    e.dispose();

    // Post-dispose behavior
    expect(a.value).toBeUndefined();
    expect(() => c.value).toThrow();
    expect(() => e.run()).toThrow();

    // Idempotent — second dispose does not throw
    a.dispose();
    c.dispose();
    e.dispose();
  });

  it('effect cleanup runs on disposal', () => {
    const cleanup = vi.fn();
    const e = effect(() => cleanup, { sync: true });
    expect(cleanup).not.toHaveBeenCalled();

    e.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

// ─── 6. Error Isolation ─────────────────────────────────────────────────────

describe('Error Isolation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('subscriber errors do not affect sibling subscribers', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = atom(0);
    const bad = vi.fn(() => {
      throw new Error('bad');
    });
    const good = vi.fn();

    a.subscribe(bad);
    a.subscribe(good);

    a.value = 1;
    await waitForScheduler();

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('computed wraps errors as ComputedError with cause', () => {
    const c = computed(() => {
      throw new TypeError('raw');
    });
    try {
      c.value;
    } catch (e) {
      expect((e as Error).name).toBe('ComputedError');
      expect((e as ComputedError).cause).toBeInstanceOf(TypeError);
    }
  });

  it('effect onError receives wrapped error and swallows handler errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const trigger = atom(0);
    const onError = vi.fn();

    // Normal onError
    effect(
      () => {
        if (trigger.value === 1) throw new Error('boom');
      },
      { onError }
    );

    trigger.value = 1;
    await waitForScheduler();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].name).toBe('EffectError');

    // onError that throws — system must stay functional
    const trigger2 = atom(false);
    effect(
      () => {
        if (trigger2.value) throw new Error('x');
      },
      {
        onError: () => {
          throw new Error('handler boom');
        },
      }
    );

    trigger2.value = true;
    await waitForScheduler();

    const a = atom(0);
    expect(computed(() => a.value + 1).value).toBe(1);
    consoleSpy.mockRestore();
  });
});

// ─── 7. Node Identity ───────────────────────────────────────────────────────

describe('Node Identity', () => {
  it('brand symbols identify node types correctly', () => {
    const a = atom(0);
    const c = computed(() => a.value);
    const e = effect(() => {
      void c.value;
    });

    expect(isAtom(a)).toBe(true);
    expect(isComputed(c)).toBe(true);
    expect(isEffect(e)).toBe(true);
    expect(isAtom({})).toBe(false);

    e.dispose();
  });
});

// ─── 8. Scheduler Invariants ────────────────────────────────────────────────

describe('Scheduler Invariants', () => {
  it('deduplicates same job within same epoch', async () => {
    let count = 0;
    const job = () => {
      count++;
    };

    scheduler.schedule(job);
    scheduler.schedule(job);

    await waitForScheduler();
    expect(count).toBe(1);
  });
});

// ─── 9. Diamond Dependency ──────────────────────────────────────────────────

describe('Diamond Dependency', () => {
  it('effect observing diamond graph computes correct value and runs once', async () => {
    const a = atom(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);

    const results: number[] = [];
    const e = effect(() => {
      results.push(d.value);
    });
    expect(results).toEqual([5]); // 2 + 3
    results.length = 0;

    a.value = 2;
    await waitForScheduler();

    expect(results).toEqual([10]); // 4 + 6, exactly once
    e.dispose();
  });
});

// ─── 10. Equality Contract ──────────────────────────────────────────────────

describe('Equality Contract', () => {
  it('atom uses Object.is (NaN === NaN)', async () => {
    const a = atom(NaN);
    const listener = vi.fn();
    a.subscribe(listener);

    a.value = NaN;
    await waitForScheduler();
    expect(listener).not.toHaveBeenCalled();
  });

  it('computed supports custom equality to suppress version bumps', () => {
    const src = atom({ id: 1, data: 'a' });
    const c = computed(() => src.value, {
      equal: (a, b) => a.id === b.id,
    });

    c.value;
    const v0 = v(c);

    src.value = { id: 1, data: 'b' };
    c.value;
    expect(v(c)).toBe(v0);
  });
});

// ─── 11. Computed State Machine ─────────────────────────────────────────────

describe('Computed State Machine', () => {
  it('sync: IDLE → RESOLVED on first access', () => {
    const c = computed(() => 42);
    expect(c.state).toBe('idle');

    expect(c.value).toBe(42);
    expect(c.state).toBe('resolved');
  });

  it('async: IDLE → PENDING → RESOLVED', async () => {
    const c = computed(
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 99;
      },
      { defaultValue: 0 }
    );

    expect(c.value).toBe(0);
    expect(c.isPending).toBe(true);

    await new Promise((r) => setTimeout(r, 30));
    expect(c.value).toBe(99);
    expect(c.isResolved).toBe(true);
  });
});

// ─── 12. Subscription Protocol ──────────────────────────────────────────────

describe('Subscription Protocol', () => {
  it('unsubscribe decrements count and is idempotent', () => {
    const a = atom(0);
    const unsub = a.subscribe(() => {});
    a.subscribe(() => {});
    expect(a.subscriberCount()).toBe(2);

    unsub();
    expect(a.subscriberCount()).toBe(1);

    unsub(); // idempotent
    expect(a.subscriberCount()).toBe(1);
  });

  it('supports both function and object subscribers', async () => {
    const a = atom(0);
    const fnCalls: number[] = [];
    const objCalls: number[] = [];

    a.subscribe((val) => fnCalls.push(val!));
    a.subscribe({ execute: () => objCalls.push(a.peek()) });

    a.value = 5;
    await waitForScheduler();

    expect(fnCalls).toEqual([5]);
    expect(objCalls).toEqual([5]);
  });

  it('notifications use snapshot (concurrent unsubscribe is safe)', () => {
    const a = atom(0, { sync: true });
    const calls: string[] = [];
    let unsub2: () => void;

    a.subscribe(() => {
      calls.push('first');
      unsub2();
    });
    unsub2 = a.subscribe(() => calls.push('second'));

    a.value = 1;
    expect(calls).toEqual(['first', 'second']);
  });
});

// ─── 13. Infinite Loop Protection ───────────────────────────────────────────

describe('Infinite Loop Protection', () => {
  it('detects and reports when effect exceeds per-flush execution limit', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const count = atom(0);

    batch(() => {
      effect(() => {
        const val = count.value;
        if (val < 200) count.value = val + 1;
      });
      count.value = 1;
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected/),
      })
    );

    consoleSpy.mockRestore();
  });
});

// ─── 14. Async Computed Safety ──────────────────────────────────────────────

describe('Async Computed Safety', () => {
  it('eventually resolves to latest value after dependency drift', async () => {
    const src = atom(1);
    const results: number[] = [];

    const c = computed(
      async () => {
        const val = src.value;
        await new Promise((r) => setTimeout(r, 20));
        return val;
      },
      { defaultValue: 0 }
    );

    effect(() => {
      results.push(c.value);
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(c.value).toBe(1);

    src.value = 2;
    await new Promise((r) => setTimeout(r, 60));

    expect(c.value).toBe(2);
    expect(results[results.length - 1]).toBe(2);
  });
});
