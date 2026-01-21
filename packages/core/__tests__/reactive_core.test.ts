import { describe, expect, it, vi } from 'vitest';
import { AsyncState, atom, batch, computed, effect, untracked } from '../src';

describe('Reactive Core - Basic Behavior', () => {
  it('atom read/write and subscription', async () => {
    const count = atom(0);
    const listener = vi.fn();
    count.subscribe(listener);

    count.value = 10;
    expect(count.value).toBe(10);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledWith(10, 0);
  });

  it('computed automatic dependency tracking and lazy evaluation', async () => {
    const count = atom(2);
    const fn = vi.fn(() => count.value * 2);
    const doubled = computed(fn);

    expect(fn).not.toHaveBeenCalled();
    expect(doubled.value).toBe(4);
    expect(fn).toHaveBeenCalledOnce();

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(doubled.value).toBe(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('effect lifecycle and cleanup', async () => {
    const count = atom(0);
    const cleanup = vi.fn();
    const calls: number[] = [];

    const stop = effect(() => {
      calls.push(count.value);
      return cleanup;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([0]);

    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cleanup).toHaveBeenCalled();
    expect(calls).toEqual([0, 1]);

    stop.dispose();
    count.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([0, 1]); // No more calls after dispose
  });
});

describe('Reactive Core - Advanced Logic', () => {
  it('handles diamond problem (A->B,C -> D)', async () => {
    const a = atom(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);
    const listener = vi.fn();
    d.subscribe(listener);

    expect(d.value).toBe(5);

    a.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(d.value).toBe(10);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('batching multiple updates', async () => {
    const a = atom(0);
    const b = atom(0);
    const sum = computed(() => a.value + b.value);
    const listener = vi.fn();
    sum.subscribe(listener);
    sum.value; // Initialize dependencies

    batch(() => {
      a.value = 1;
      b.value = 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sum.value).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('untracked reads and deep dependency chains', () => {
    const a = atom(1);
    const b = atom(2);
    const c = computed(() => a.value + untracked(() => b.value));

    expect(c.value).toBe(3);
    b.value = 10;
    expect(c.value).toBe(3); // No recalculation on b change

    // Deep chain
    let current = atom(1);
    for (let i = 0; i < 50; i++) {
      const prev = current;
      current = computed(() => prev.value + 1) as any;
    }
    expect(current.value).toBe(51);
  });

  it('async computation and error handling', async () => {
    const a = atom(1);
    const c = computed(
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        if (a.value < 0) throw new Error('Fail');
        return a.value * 2;
      },
      { defaultValue: 0 }
    );

    expect(c.value).toBe(0);
    expect(c.state).toBe(AsyncState.PENDING);

    await new Promise((r) => setTimeout(r, 20));
    expect(c.value).toBe(2);
    expect(c.state).toBe(AsyncState.RESOLVED);

    // Error case
    const errors: any[] = [];
    const risky = computed(
      () => {
        if (a.value === 0) throw new Error('Direct Error');
        return a.value;
      },
      { onError: (e) => errors.push(e) }
    );

    a.value = 0;
    expect(() => risky.value).toThrow();
    expect(errors.length).toBe(1);
  });
});
