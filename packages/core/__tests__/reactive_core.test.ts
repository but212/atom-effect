import { describe, expect, it, vi } from 'vitest';
import {
  atom,
  batch,
  type ComputedAtom,
  computed,
  effect,
  untracked,
  type WritableAtom,
} from '../src';
import { sleep, waitForScheduler } from './utils/test-helpers';

describe('Reactive Core - Smoke Tests', () => {
  it('basic reactive flow (atom -> computed -> effect)', async () => {
    const count = atom(0);
    const doubled = computed(() => count.value * 2);
    const results: number[] = [];

    effect(() => {
      results.push(doubled.value);
    });

    await waitForScheduler();
    expect(results).toEqual([0]);

    count.value = 5;
    await waitForScheduler();
    expect(results).toEqual([0, 10]);
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
    let current: ComputedAtom<number> | WritableAtom<number> = atom(1);
    for (let i = 0; i < 50; i++) {
      const prev: ComputedAtom<number> | WritableAtom<number> = current;
      current = computed(() => prev.value + 1);
    }
    expect(current.value).toBe(51);
  });

  it('async computation flow', async () => {
    const a = atom(1);
    const c = computed(
      async () => {
        await sleep(10);
        return a.value * 2;
      },
      { defaultValue: 0 }
    );

    expect(c.value).toBe(0);
    await sleep(20);
    expect(c.value).toBe(2);
  });
});
