import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { batch, scheduler, untracked } from '@/index';

import { flush } from '../../utils/test-helpers';

describe('batch()', () => {
  it('coalesces updates and passes return value through', () => {
    const a = atom(0);
    const log: number[] = [];
    a.subscribe((v) => v !== undefined && log.push(v));

    const result = batch(() => {
      a.value = 1;
      a.value = 2;
      batch(() => {
        a.value = 3;
      });
      return 'done';
    });

    expect(result).toBe('done');
    expect(log).toEqual([3]);
  });

  it('propagates errors and validates input', () => {
    expect(() => batch(null as unknown as () => void)).toThrow();
    expect(() =>
      batch(() => {
        throw new Error('Fail');
      })
    ).toThrow('Fail');
  });

  it('computed reads are fresh within a batch', () => {
    const a = atom(0);
    const c = computed(() => a.value + 1);

    batch(() => {
      a.value = 10;
      expect(c.value).toBe(11);
    });

    expect(c.value).toBe(11);
  });

  it('effect triggered by batch runs once after batch ends', () => {
    const a = atom(0);
    const b = atom(0);
    const executions: number[] = [];

    effect(() => {
      executions.push(a.value + b.value);
    });

    const initialCount = executions.length;

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    expect(executions.length).toBe(initialCount + 1);
    expect(executions[executions.length - 1]).toBe(30);
  });

  it('commits atom changes even when batch callback throws', () => {
    const a = atom(0);

    try {
      batch(() => {
        a.value = 42;
        throw new Error('mid-batch');
      });
    } catch {
      /* expected */
    }

    expect(a.value).toBe(42);
    expect(scheduler.isBatching).toBe(false);
  });
});

describe('untracked()', () => {
  it('suppresses dependency tracking inside computed', () => {
    const a = atom(0);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return untracked(() => a.value);
    });

    expect(c.value).toBe(0);
    expect(computeCount).toBe(1);

    a.value = 1;
    expect(c.value).toBe(0); // not recomputed
    expect(computeCount).toBe(1);
  });

  it('passes return value through and propagates errors', () => {
    expect(untracked(() => 42)).toBe(42);
    expect(() =>
      untracked(() => {
        throw new Error('Ops');
      })
    ).toThrow('Ops');
  });

  it('computed with mixed tracked and untracked deps only reacts to tracked', async () => {
    const a = atom(1);
    const b = atom(10);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return a.value + untracked(() => b.value);
    });

    expect(c.value).toBe(11);
    expect(computeCount).toBe(1);

    b.value = 20; // untracked — c must not recompute
    await flush();
    expect(c.value).toBe(11);
    expect(computeCount).toBe(1);

    a.value = 2; // tracked — c recomputes and picks up latest b
    await flush();
    expect(c.value).toBe(22); // 2 + 20
    expect(computeCount).toBe(2);
  });
});
