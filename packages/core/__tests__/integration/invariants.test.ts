/**
 * @fileoverview Core Invariant Tests
 */

import { getNodeVersion } from '@tests/utils/test-helpers';
import { describe, expect, it, vi } from 'vitest';
import { aeNextTick, atom, batch, computed, effect, untracked } from '@/index';

describe('Version Semantics', () => {
  it('atom version increments on change, stays on same-value assignment', () => {
    const someAtom = atom(0);
    const initialVersion = getNodeVersion(someAtom);

    someAtom.value = 1;
    expect(getNodeVersion(someAtom)).toBe(initialVersion + 1);

    const firstVersion = getNodeVersion(someAtom);
    someAtom.value = 1;
    expect(getNodeVersion(someAtom)).toBe(firstVersion);
  });

  it('computed version bumps only on resolution with changed value', () => {
    const source = atom(0);
    const computedInstance = computed(() => Math.floor(source.value / 10));
    computedInstance.value;
    const initialVersion = getNodeVersion(computedInstance);

    computedInstance.invalidate();
    expect(getNodeVersion(computedInstance)).toBe(initialVersion);

    source.value = 5;
    computedInstance.value;
    expect(getNodeVersion(computedInstance)).toBe(initialVersion);

    source.value = 99;
    computedInstance.invalidate();
    computedInstance.value;
    expect(getNodeVersion(computedInstance)).toBeGreaterThan(initialVersion);
  });

  it('computed bumps version on async error', async () => {
    const computedInstance = computed(
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        throw new Error('async-fail');
      },
      { defaultValue: -1 }
    );

    computedInstance.value;
    const initialVersion = getNodeVersion(computedInstance);

    await new Promise((r) => setTimeout(r, 30));

    expect(getNodeVersion(computedInstance)).toBeGreaterThan(initialVersion);
    expect(computedInstance.hasError).toBe(true);
  });
});

describe('Push-Pull Propagation', () => {
  it('atom notifies async by default, sync when opted in', async () => {
    const asyncAtom = atom(0);
    const asyncCalls: number[] = [];
    asyncAtom.subscribe((value) => asyncCalls.push(value ?? 0));

    asyncAtom.value = 1;
    expect(asyncCalls).toEqual([]);

    await aeNextTick();
    expect(asyncCalls).toEqual([1]);

    const syncAtom = atom(0, { sync: true });
    const syncCalls: number[] = [];
    syncAtom.subscribe((value) => syncCalls.push(value ?? 0));

    syncAtom.value = 1;
    expect(syncCalls).toEqual([1]);
  });

  it('effect pulls computed value during dirty check', async () => {
    const source = atom(0);
    let computeCount = 0;
    const computedInstance = computed(() => {
      computeCount++;
      return source.value * 2;
    });

    const results: number[] = [];
    const effectInstance = effect(() => {
      results.push(computedInstance.value);
    });
    expect(computeCount).toBe(1);
    expect(results).toEqual([0]);

    source.value = 5;
    await aeNextTick();
    expect(results).toContain(10);
    expect(computeCount).toBeGreaterThanOrEqual(2);

    effectInstance.dispose();
  });
});

describe('Dependency Tracking', () => {
  it('tracks only accessed dependencies and prunes on branch switch', async () => {
    const toggle = atom(true);
    const firstAtom = atom('A');
    const secondAtom = atom('B');
    let runs = 0;
    const computedInstance = computed(() => {
      runs++;
      return toggle.value ? firstAtom.value : secondAtom.value;
    });

    expect(computedInstance.value).toBe('A');
    expect(runs).toBe(1);

    secondAtom.value = 'B2';
    await aeNextTick();
    computedInstance.invalidate();
    expect(computedInstance.value).toBe('A');
    expect(runs).toBe(2);

    toggle.value = false;
    computedInstance.invalidate();
    expect(computedInstance.value).toBe('B2');
    expect(runs).toBe(3);

    const runsAfterSwitch = runs;
    firstAtom.value = 'A2';
    await aeNextTick();
    expect(runs).toBe(runsAfterSwitch);
  });

  it('untracked reads do not create dependencies', () => {
    const firstAtom = atom(1);
    const secondAtom = atom(100);
    const computedInstance = computed(() => firstAtom.value + untracked(() => secondAtom.value));

    expect(computedInstance.value).toBe(101);
    secondAtom.value = 200;
    expect(computedInstance.value).toBe(101);
  });

  it('deduplicates same dependency accessed multiple times', () => {
    const someAtom = atom(1);
    const computedInstance = computed(() => someAtom.value + someAtom.value + someAtom.value);
    expect(computedInstance.value).toBe(3);
    expect(someAtom.subscriberCount()).toBe(1);
  });
});

describe('Batch Guarantees', () => {
  it('defers all notifications until outermost batch completes', async () => {
    const firstAtom = atom(0);
    const secondAtom = atom(0);
    const results: [number, number][] = [];

    effect(() => {
      results.push([firstAtom.value, secondAtom.value]);
    });
    results.length = 0;

    batch(() => {
      firstAtom.value = 1;
      batch(() => {
        secondAtom.value = 2;
        firstAtom.value = 3;
      });
      secondAtom.value = 4;
    });

    await aeNextTick();
    expect(results).toEqual([[3, 4]]);
  });
});

describe('Disposal Finality', () => {
  it('all node types become unusable after dispose and dispose is idempotent', () => {
    const someAtom = atom(42);
    const computedInstance = computed(() => someAtom.value);
    computedInstance.value;
    const effectInstance = effect(() => {
      void computedInstance.value;
    });

    someAtom.dispose();
    computedInstance.dispose();
    effectInstance.dispose();

    expect(someAtom.value).toBeUndefined();
    expect(() => computedInstance.value).toThrow();
    expect(() => effectInstance.run()).toThrow();

    someAtom.dispose();
    computedInstance.dispose();
    effectInstance.dispose();
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
      const safeEffect = effect(() => {
        safeContainer.push(source.value);
      });
      safeEffect.dispose();
    }

    source.value = 2;
    await aeNextTick();

    expect(safeContainer).toEqual([1]);
    expect(leakContainer).toEqual([0, 1, 2]);
  });
});

describe('Error Isolation', () => {
  it('subscriber errors do not affect sibling subscribers', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const someAtom = atom(0);
    const bad = vi.fn(() => {
      throw new Error('bad');
    });
    const good = vi.fn();

    someAtom.subscribe(bad);
    someAtom.subscribe(good);

    someAtom.value = 1;
    await aeNextTick();

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('computed wraps errors as ComputedError with cause', () => {
    const computedInstance = computed(() => {
      throw new TypeError('raw');
    });
    try {
      computedInstance.value;
    } catch (err) {
      expect(Reflect.get(err as object, 'name')).toBe('ComputedError');
      expect(Reflect.get(err as object, 'cause')).toBeInstanceOf(TypeError);
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

    const someAtom = atom(0);
    expect(computed(() => someAtom.value + 1).value).toBe(1);
    consoleSpy.mockRestore();
  });
});

describe('Equality Contract', () => {
  it('atom uses Object.is (NaN === NaN)', async () => {
    const someAtom = atom(NaN);
    const listener = vi.fn();
    someAtom.subscribe(listener);

    someAtom.value = NaN;
    await aeNextTick();
    expect(listener).not.toHaveBeenCalled();
  });

  it('computed supports custom equality to suppress version bumps', () => {
    const source = atom({ id: 1, data: 'a' });
    const computedInstance = computed(() => source.value, {
      equal: (a, b) => a.id === b.id,
    });

    computedInstance.value;
    const initialVersion = getNodeVersion(computedInstance);

    source.value = { id: 1, data: 'b' };
    computedInstance.value;
    expect(getNodeVersion(computedInstance)).toBe(initialVersion);
  });
});

describe('Computed State Machine', () => {
  it('sync: IDLE → RESOLVED on first access', () => {
    const computedInstance = computed(() => 42);
    expect(computedInstance.state).toBe('idle');

    expect(computedInstance.value).toBe(42);
    expect(computedInstance.state).toBe('resolved');
  });

  it('async: IDLE → PENDING → RESOLVED', async () => {
    const computedInstance = computed(
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 99;
      },
      { defaultValue: 0 }
    );

    expect(computedInstance.value).toBe(0);
    expect(computedInstance.isPending).toBe(true);

    await new Promise((r) => setTimeout(r, 30));
    expect(computedInstance.value).toBe(99);
    expect(computedInstance.isResolved).toBe(true);
  });
});

describe('Subscription Protocol', () => {
  it('unsubscribe decrements count and is idempotent', () => {
    const someAtom = atom(0);
    const unsubscribeCallback = someAtom.subscribe(() => {});
    someAtom.subscribe(() => {});
    expect(someAtom.subscriberCount()).toBe(2);

    unsubscribeCallback();
    expect(someAtom.subscriberCount()).toBe(1);

    unsubscribeCallback();
    expect(someAtom.subscriberCount()).toBe(1);
  });

  it('supports both function and object subscribers', async () => {
    const someAtom = atom(0);
    const fnCalls: number[] = [];
    const objCalls: number[] = [];

    someAtom.subscribe((value) => fnCalls.push(value ?? 0));
    someAtom.subscribe({ execute: () => objCalls.push(someAtom.peek()) });

    someAtom.value = 5;
    await aeNextTick();

    expect(fnCalls).toEqual([5]);
    expect(objCalls).toEqual([5]);
  });

  it('concurrent unsubscribe prevents notification in current batch', () => {
    const someAtom = atom(0, { sync: true });
    const calls: string[] = [];
    let unsub2: () => void;

    someAtom.subscribe(() => {
      calls.push('first');
      unsub2();
    });
    unsub2 = someAtom.subscribe(() => calls.push('second'));

    someAtom.value = 1;
    expect(calls).toEqual(['first']);
  });
});

describe('Async Computed Safety', () => {
  it('eventually resolves to latest value after dependency drift', async () => {
    const source = atom(1);
    const results: number[] = [];

    const computedInstance = computed(
      async () => {
        const value = source.value;
        await new Promise((r) => setTimeout(r, 20));
        return value;
      },
      { defaultValue: 0 }
    );

    effect(() => {
      results.push(computedInstance.value);
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(computedInstance.value).toBe(1);

    source.value = 2;
    await new Promise((r) => setTimeout(r, 60));

    expect(computedInstance.value).toBe(2);
    expect(results[results.length - 1]).toBe(2);
  });
});
