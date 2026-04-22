/**
 * @fileoverview Core Invariant Tests
 * @description Verifies the fundamental behavioral contracts of the reactive system.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { aeNextTick, atom, batch, type ComputedError, computed, effect, untracked } from '@/index';
import { getNodeVersion } from '../utils/test-helpers';

// ─── 1. Version Semantics ───────────────────────────────────────────────────

describe('Version Semantics', () => {
  it('atom version increments on change, stays on same-value assignment', () => {
    const a = atom(0);
    const v0 = getNodeVersion(a);

    a.value = 1;
    expect(getNodeVersion(a)).toBe(v0 + 1);

    const v1 = getNodeVersion(a);
    a.value = 1; // same value
    expect(getNodeVersion(a)).toBe(v1);
  });

  it('computed version bumps only on resolution with changed value', () => {
    const src = atom(0);
    const c = computed(() => Math.floor(src.value / 10));
    c.value; // initial resolve → 0
    const v0 = getNodeVersion(c);

    // markDirty does NOT bump version
    c.invalidate();
    expect(getNodeVersion(c)).toBe(v0);

    // same resolved value (floor(5/10)=0) → no bump
    src.value = 5;
    c.value;
    expect(getNodeVersion(c)).toBe(v0);

    // different resolved value → bump
    src.value = 99;
    c.invalidate();
    c.value;
    expect(getNodeVersion(c)).toBeGreaterThan(v0);
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
    const v0 = getNodeVersion(c);

    await new Promise((r) => setTimeout(r, 30));

    expect(getNodeVersion(c)).toBeGreaterThan(v0);
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

    await aeNextTick();
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
    await aeNextTick();
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
    await aeNextTick();
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
    await aeNextTick();
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

    await aeNextTick();
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

    a.dispose();
    c.dispose();
    e.dispose();

    expect(a.value).toBeUndefined();
    expect(() => c.value).toThrow();
    expect(() => e.run()).toThrow();

    // Idempotent — second dispose does not throw
    a.dispose();
    c.dispose();
    e.dispose();
  });

  it('manual disposal prevents memory leaks and zombie listeners', async () => {
    const leakContainer: number[] = [];
    const source = atom(0);

    {
      const _leakEffect = effect(() => {
        leakContainer.push(source.value);
      });
    }

    source.value = 1;
    await aeNextTick();
    expect(leakContainer).toEqual([0, 1]);

    const safeContainer: number[] = [];
    {
      const _safeEffect = effect(() => {
        safeContainer.push(source.value);
      });
      // Manual disposal replaces ES2023 'using' for ES2021 compatibility
      _safeEffect.dispose();
    }

    source.value = 2;
    await aeNextTick();

    expect(safeContainer).toEqual([1]);
    expect(leakContainer).toEqual([0, 1, 2]);
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
    await aeNextTick();

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

    effect(
      () => {
        if (trigger.value === 1) throw new Error('boom');
      },
      { onError }
    );

    trigger.value = 1;
    await aeNextTick();

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
    await aeNextTick();

    const a = atom(0);
    expect(computed(() => a.value + 1).value).toBe(1);
    consoleSpy.mockRestore();
  });
});

// ─── 7. Equality Contract ───────────────────────────────────────────────────

describe('Equality Contract', () => {
  it('atom uses Object.is (NaN === NaN)', async () => {
    const a = atom(NaN);
    const listener = vi.fn();
    a.subscribe(listener);

    a.value = NaN;
    await aeNextTick();
    expect(listener).not.toHaveBeenCalled();
  });

  it('computed supports custom equality to suppress version bumps', () => {
    const src = atom({ id: 1, data: 'a' });
    const c = computed(() => src.value, {
      equal: (a, b) => a.id === b.id,
    });

    c.value;
    const v0 = getNodeVersion(c);

    src.value = { id: 1, data: 'b' };
    c.value;
    expect(getNodeVersion(c)).toBe(v0);
  });
});

// ─── 8. Computed State Machine ──────────────────────────────────────────────

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

// ─── 9. Subscription Protocol ───────────────────────────────────────────────

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
    await aeNextTick();

    expect(fnCalls).toEqual([5]);
    expect(objCalls).toEqual([5]);
  });

  it('concurrent unsubscribe prevents notification in current batch', () => {
    const a = atom(0, { sync: true });
    const calls: string[] = [];
    let unsub2: () => void;

    a.subscribe(() => {
      calls.push('first');
      unsub2();
    });
    unsub2 = a.subscribe(() => calls.push('second'));

    a.value = 1;
    // 'second' is no longer pushed since unsubscribe is immediate via tombstones
    expect(calls).toEqual(['first']);
  });
});

// ─── 10. Async Computed Safety ──────────────────────────────────────────────

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
